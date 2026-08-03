<#
.SYNOPSIS
Post-redeploy proof that a Blog-Bot deployment is actually serving the
expected build, with an expected MCP write catalog (issue #109).

.DESCRIPTION
A successful "call the Portainer redeploy webhook" step only proves the HTTP
request was accepted -- it does not prove the public endpoint is serving that
image. This script closes that gap in two bounded phases:

1. Poll GET {BaseUri}/healthz (see src/http.ts's healthPayload/src/runtimeInfo.ts)
   until it reports the exact expected revision for StabilitySampleCount
   consecutive samples, or fail with a classification.
2. Once the runtime is proven current, run a real MCP session against
   {BaseUri}/mcp (initialize -> notifications/initialized -> tools/list,
   following pagination -> tools/call blog_repo_status) and assert the
   expected write-capable tool catalog and the same revision are actually
   being served, not just labelled in a health payload.

Never accepts the deployment bearer token as a parameter -- it is read only
from $env:BLOG_MCP_DEPLOY_VERIFY_TOKEN, and every diagnostic string this
script writes is scrubbed of the token value before being printed or added to
$env:GITHUB_STEP_SUMMARY.

Exit code is non-zero for every classification except 'verified'. See the
$Classification variable each terminal path sets before returning/throwing.

.PARAMETER BaseUri
Public base URL of the deployment, e.g. https://blogging.subzerodev.com. No
trailing slash.

.PARAMETER ExpectedRevision
The full 40-character lowercase hex commit SHA (or the literal 'development'
for a local smoke test) this deployment must be serving.

.PARAMETER TimeoutSeconds
Upper bound on phase 1 (health polling). Default 600 (10 minutes).

.PARAMETER PollIntervalSeconds
Delay between health polls. Default 10.

.PARAMETER StabilitySampleCount
Consecutive matching health samples required before phase 1 is considered
satisfied -- guards against a proxy or load balancer intermittently routing
to a stale parallel instance. Default 3.

.PARAMETER RequiredTool
Tool names that must appear in the write-profile tools/list catalog. Defaults
to the four tools issue #109 specifically calls out.
#>
[CmdletBinding()]
param (
    [Parameter(Mandatory)]
    [string] $BaseUri,

    [Parameter(Mandatory)]
    [string] $ExpectedRevision,

    [int] $TimeoutSeconds = 600,

    [int] $PollIntervalSeconds = 10,

    [int] $StabilitySampleCount = 3,

    [string[]] $RequiredTool = @('blog_repo_status', 'blog_prepare_publish_branch', 'blog_restore_paths', 'blog_create_post')
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
# Invoke-WebRequest's own transport failures (connection refused, DNS, TLS)
# must still terminate -- only its -SkipHttpErrorCheck path is meant to be
# inspected rather than thrown. Leaving native-command preference alone: this
# script calls no native executables.

$BaseUri = $BaseUri.TrimEnd('/')

$Token = $env:BLOG_MCP_DEPLOY_VERIFY_TOKEN
if ([string]::IsNullOrWhiteSpace($Token)) {
    throw 'BLOG_MCP_DEPLOY_VERIFY_TOKEN is not set. Refusing to run unauthenticated -- fail closed rather than skip verification.'
}

# ---------------------------------------------------------------------------
# Redaction -- every string this script writes anywhere (Write-Host, thrown
# messages, $GITHUB_STEP_SUMMARY) passes through this first. Defense in
# depth: no code path below intentionally embeds $Token in output, but an
# unanticipated exception message (e.g. a web client library echoing request
# headers) must not be able to leak it either.
# ---------------------------------------------------------------------------

function Protect-Secret {
    param ([Parameter(Mandatory)] [AllowEmptyString()] [string] $Text)
    if ([string]::IsNullOrEmpty($Token)) { return $Text }
    return $Text.Replace($Token, '[redacted]')
}

function Write-VerifierHost {
    param ([Parameter(Mandatory)] [AllowEmptyString()] [string] $Message)
    Write-Host (Protect-Secret -Text $Message)
}

$script:StepSummaryLine = [System.Collections.Generic.List[string]]::new()
function Add-SummaryLine {
    param ([Parameter(Mandatory)] [AllowEmptyString()] [string] $Line)
    $script:StepSummaryLine.Add((Protect-Secret -Text $Line))
}

function Write-Summary {
    if ([string]::IsNullOrWhiteSpace($env:GITHUB_STEP_SUMMARY)) { return }
    Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value ($script:StepSummaryLine -join "`n")
}

# ---------------------------------------------------------------------------
# JSON-RPC / SSE response parsing -- mirrors tools/blog-mcp/test/http.test.ts's
# parseSseOrJson(): StreamableHTTPServerTransport replies with either a plain
# JSON body or one `data:` SSE frame per message; both are valid per spec.
# ---------------------------------------------------------------------------

function ConvertFrom-McpResponseBody {
    param ([Parameter(Mandatory)] [AllowEmptyString()] [string] $Content)
    if ([string]::IsNullOrWhiteSpace($Content)) { return $null }
    $dataLine = ($Content -split "`r?`n") | Where-Object { $_.StartsWith('data: ') } | Select-Object -First 1
    $jsonText = if ($dataLine) { $dataLine.Substring(6) } else { $Content }
    return $jsonText | ConvertFrom-Json -Depth 32
}

function Get-ResponseHeader {
    param (
        [Parameter(Mandatory)] $Response,
        [Parameter(Mandatory)] [string] $Name
    )
    $value = $Response.Headers[$Name]
    if ($null -eq $value) { return $null }
    if ($value -is [array]) { return $value[0] }
    return $value
}

# Set-StrictMode -Version 3.0 (above) makes a plain `.Foo` access throw when
# the property doesn't exist on a PSCustomObject -- which a JSON-RPC error
# response's absent `.result`, a success response's absent `.error`, a
# non-final page's absent `.result.nextCursor`, and any malformed/incomplete
# health payload from a misbehaving intermediary or in-flight deploy will all
# genuinely do. Every property read from a parsed HTTP response body goes
# through this instead of a bare `.` access.
function Get-OptionalProperty {
    param (
        [Parameter(Mandatory)] [AllowNull()] $Object,
        [Parameter(Mandatory)] [string] $Name
    )
    if ($null -eq $Object) { return $null }
    $prop = $Object.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}

# ===========================================================================
# Phase 1: poll /healthz until the exact expected revision is stable
# ===========================================================================

function Wait-ForExpectedRevision {
    param (
        [Parameter(Mandatory)] [string] $BaseUri,
        [Parameter(Mandatory)] [string] $ExpectedRevision,
        [Parameter(Mandatory)] [int] $TimeoutSeconds,
        [Parameter(Mandatory)] [int] $PollIntervalSeconds,
        [Parameter(Mandatory)] [int] $StabilitySampleCount
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $consecutiveMatch = 0
    $lastInstanceId = $null
    $everReachedHealth = $false
    $everMatchedRevision = $false
    $observedRevision = [System.Collections.Generic.HashSet[string]]::new()
    $observedInstance = [System.Collections.Generic.HashSet[string]]::new()
    $lastSnapshot = $null

    while ($true) {
        $probe = [guid]::NewGuid().ToString('N')
        $snapshot = $null
        try {
            $response = Invoke-WebRequest -Uri "$BaseUri/healthz?probe=$probe" -Method Get -SkipHttpErrorCheck -TimeoutSec ([Math]::Max(5, $PollIntervalSeconds))
            if ($response.StatusCode -eq 200) {
                $snapshot = $response.Content | ConvertFrom-Json -Depth 8
            }
        }
        catch {
            # Transport-level failure (connection refused, DNS, timeout) --
            # treated as "not yet reachable", not an immediate hard failure,
            # so a container mid-restart doesn't false-positive as unreachable.
            Write-VerifierHost "healthz probe failed: $($_.Exception.Message)"
        }

        $schema = Get-OptionalProperty -Object $snapshot -Name 'schema'
        if ($null -ne $snapshot -and $schema -eq 'blog-mcp-health/v1') {
            $revision = Get-OptionalProperty -Object $snapshot -Name 'revision'
            $instanceId = Get-OptionalProperty -Object $snapshot -Name 'instanceId'
            if ([string]::IsNullOrEmpty($revision) -or [string]::IsNullOrEmpty($instanceId)) {
                # Correctly schema-tagged but missing the fields this whole
                # script depends on -- a malformed response, not a "not yet"
                # one. Do not silently skip it; surface it and keep polling
                # (it may self-correct once the real deployment catches up).
                Write-VerifierHost "healthz: schema present but revision/instanceId missing or empty -- treating as not-yet-ready."
            }
            else {
                $everReachedHealth = $true
                $lastSnapshot = $snapshot
                [void]$observedRevision.Add([string]$revision)
                [void]$observedInstance.Add([string]$instanceId)

                if ($revision -eq $ExpectedRevision -and $instanceId -eq $lastInstanceId) {
                    $consecutiveMatch++
                }
                elseif ($revision -eq $ExpectedRevision) {
                    $consecutiveMatch = 1
                    $lastInstanceId = $instanceId
                }
                else {
                    $consecutiveMatch = 0
                    $lastInstanceId = $instanceId
                }

                if ($revision -eq $ExpectedRevision) { $everMatchedRevision = $true }

                Write-VerifierHost "healthz: revision=$revision instanceId=$instanceId consecutiveMatch=$consecutiveMatch/$StabilitySampleCount"

                if ($consecutiveMatch -ge $StabilitySampleCount) {
                    return [pscustomobject]@{ Classification = 'verified'; Snapshot = $snapshot }
                }
            }
        }

        if ((Get-Date) -ge $deadline) {
            $classification = if (-not $everReachedHealth) {
                'unreachable'
            }
            elseif ($observedRevision.Count -gt 1 -or $observedInstance.Count -gt 1) {
                'mixed-runtime'
            }
            elseif ($everMatchedRevision) {
                # Matched at least once but never reached stability, and only
                # ever one revision/instance was observed -- still classify as
                # mixed-runtime, since a single-sample match that never
                # stabilizes is exactly the "intermittent" case this counter
                # exists to catch.
                'mixed-runtime'
            }
            else {
                'stale-runtime'
            }
            return [pscustomobject]@{ Classification = $classification; Snapshot = $lastSnapshot }
        }

        Start-Sleep -Seconds $PollIntervalSeconds
    }
}

Write-VerifierHost "Polling $BaseUri/healthz for revision $ExpectedRevision (timeout ${TimeoutSeconds}s, stability $StabilitySampleCount consecutive samples)..."
$healthResult = Wait-ForExpectedRevision -BaseUri $BaseUri -ExpectedRevision $ExpectedRevision -TimeoutSeconds $TimeoutSeconds -PollIntervalSeconds $PollIntervalSeconds -StabilitySampleCount $StabilitySampleCount

Add-SummaryLine '### Blog-Bot deployment verification'
Add-SummaryLine ''
Add-SummaryLine "Expected revision: ``$ExpectedRevision``"
Add-SummaryLine "Base URI: ``$BaseUri``"

if ($healthResult.Classification -ne 'verified') {
    Add-SummaryLine "Classification: **$($healthResult.Classification)**"
    Add-SummaryLine ''
    Add-SummaryLine 'The public runtime never proved it was serving the expected revision within the timeout.'
    Write-Summary
    Write-VerifierHost "CLASSIFICATION=$($healthResult.Classification)"
    throw "Deployment verification failed: $($healthResult.Classification). The public runtime at '$BaseUri' did not stably report revision '$ExpectedRevision' within ${TimeoutSeconds}s."
}

Write-VerifierHost "Runtime revision confirmed stable: $($healthResult.Snapshot.revision) (instance $($healthResult.Snapshot.instanceId))."

# ===========================================================================
# Phase 2: authenticated MCP initialize -> tools/list -> blog_repo_status
# ===========================================================================

$sessionId = $null
$classification = $null
$toolNames = [System.Collections.Generic.List[string]]::new()
$repoStatusData = $null

try {
    # --- initialize -----------------------------------------------------------
    $initBody = @{
        jsonrpc = '2.0'
        id      = 1
        method  = 'initialize'
        params  = @{
            protocolVersion = '2025-06-18'
            capabilities    = @{}
            clientInfo      = @{ name = 'Confirm-BlogMcpDeployment'; version = '1.0.0' }
        }
    } | ConvertTo-Json -Depth 10

    $initHeaders = @{ Authorization = "Bearer $Token"; Accept = 'application/json, text/event-stream' }
    $initResponse = Invoke-WebRequest -Uri "$BaseUri/mcp" -Method Post -Headers $initHeaders -ContentType 'application/json' -Body $initBody -SkipHttpErrorCheck -TimeoutSec 30

    if ($initResponse.StatusCode -eq 401 -or $initResponse.StatusCode -eq 403) {
        $classification = 'verification-credential'
        throw "MCP initialize returned $($initResponse.StatusCode). BLOG_MCP_DEPLOY_VERIFY_TOKEN does not match the deployment's primary write bearer token."
    }
    if ($initResponse.StatusCode -ne 200) {
        $classification = 'unexpected-profile-or-catalog'
        throw "MCP initialize returned unexpected status $($initResponse.StatusCode): $($initResponse.Content)"
    }

    $sessionId = Get-ResponseHeader -Response $initResponse -Name 'Mcp-Session-Id'
    if (-not $sessionId) {
        $classification = 'unexpected-profile-or-catalog'
        throw 'MCP initialize succeeded but returned no Mcp-Session-Id header.'
    }
    Write-VerifierHost "MCP session established: $sessionId"

    $mcpHeaders = @{ Authorization = "Bearer $Token"; Accept = 'application/json, text/event-stream'; 'Mcp-Session-Id' = $sessionId }

    # --- notifications/initialized ---------------------------------------------
    $initializedBody = @{ jsonrpc = '2.0'; method = 'notifications/initialized' } | ConvertTo-Json -Depth 5
    [void](Invoke-WebRequest -Uri "$BaseUri/mcp" -Method Post -Headers $mcpHeaders -ContentType 'application/json' -Body $initializedBody -SkipHttpErrorCheck -TimeoutSec 30)

    # --- tools/list, following pagination ---------------------------------------
    $cursor = $null
    $requestId = 2
    do {
        $params = if ($cursor) { @{ cursor = $cursor } } else { @{} }
        $listBody = @{ jsonrpc = '2.0'; id = $requestId; method = 'tools/list'; params = $params } | ConvertTo-Json -Depth 10
        $requestId++
        $listResponse = Invoke-WebRequest -Uri "$BaseUri/mcp" -Method Post -Headers $mcpHeaders -ContentType 'application/json' -Body $listBody -SkipHttpErrorCheck -TimeoutSec 30
        if ($listResponse.StatusCode -ne 200) {
            $classification = 'unexpected-profile-or-catalog'
            throw "tools/list returned unexpected status $($listResponse.StatusCode): $($listResponse.Content)"
        }
        $listParsed = ConvertFrom-McpResponseBody -Content $listResponse.Content
        $listError = Get-OptionalProperty -Object $listParsed -Name 'error'
        if ($listError) {
            $classification = 'unexpected-profile-or-catalog'
            throw "tools/list returned a JSON-RPC error: $(Get-OptionalProperty -Object $listError -Name 'message')"
        }
        $listResult = Get-OptionalProperty -Object $listParsed -Name 'result'
        foreach ($tool in (Get-OptionalProperty -Object $listResult -Name 'tools')) {
            [void]$toolNames.Add([string](Get-OptionalProperty -Object $tool -Name 'name'))
        }
        # nextCursor is opaque per spec -- passed straight through, never parsed.
        $cursor = Get-OptionalProperty -Object $listResult -Name 'nextCursor'
    } while ($cursor)

    Write-VerifierHost "tools/list returned $($toolNames.Count) tool(s)."

    $missingTool = @($RequiredTool | Where-Object { $toolNames -notcontains $_ })
    if ($missingTool.Count -gt 0) {
        $classification = 'unexpected-profile-or-catalog'
        throw "Required tool(s) missing from the deployed catalog: $($missingTool -join ', ')."
    }

    # --- tools/call blog_repo_status --------------------------------------------
    $statusBody = @{ jsonrpc = '2.0'; id = $requestId; method = 'tools/call'; params = @{ name = 'blog_repo_status'; arguments = @{} } } | ConvertTo-Json -Depth 10
    $statusResponse = Invoke-WebRequest -Uri "$BaseUri/mcp" -Method Post -Headers $mcpHeaders -ContentType 'application/json' -Body $statusBody -SkipHttpErrorCheck -TimeoutSec 30
    if ($statusResponse.StatusCode -ne 200) {
        $classification = 'unexpected-profile-or-catalog'
        throw "blog_repo_status call returned unexpected status $($statusResponse.StatusCode): $($statusResponse.Content)"
    }
    $statusParsed = ConvertFrom-McpResponseBody -Content $statusResponse.Content
    $statusError = Get-OptionalProperty -Object $statusParsed -Name 'error'
    if ($statusError) {
        $classification = 'unexpected-profile-or-catalog'
        throw "blog_repo_status returned a JSON-RPC error: $(Get-OptionalProperty -Object $statusError -Name 'message')"
    }
    $statusResult = Get-OptionalProperty -Object $statusParsed -Name 'result'
    $structuredContent = Get-OptionalProperty -Object $statusResult -Name 'structuredContent'
    $repoStatusData = Get-OptionalProperty -Object $structuredContent -Name 'data'
    $reportedRevision = Get-OptionalProperty -Object $repoStatusData -Name 'revision'
    $reportedCapabilities = Get-OptionalProperty -Object $repoStatusData -Name 'capabilities'
    $reportedWrite = Get-OptionalProperty -Object $reportedCapabilities -Name 'write'

    if ($reportedRevision -ne $ExpectedRevision) {
        $classification = 'unexpected-profile-or-catalog'
        throw "blog_repo_status reported revision '$reportedRevision', but /healthz reported '$ExpectedRevision' -- runtime identity mismatch between the health probe and the live MCP session."
    }
    if ($reportedWrite -ne $true) {
        $classification = 'unexpected-profile-or-catalog'
        throw "blog_repo_status reported capabilities.write=$reportedWrite for the deployment's primary token -- expected the full write profile."
    }

    $classification = 'verified'
}
catch {
    if (-not $classification) { $classification = 'unexpected-profile-or-catalog' }
    Add-SummaryLine "Classification: **$classification**"
    Add-SummaryLine ''
    Add-SummaryLine "Tools observed: $($toolNames.Count)"
    if ($sessionId) { Add-SummaryLine "MCP session: ``$sessionId``" }
    Add-SummaryLine ''
    Add-SummaryLine (Protect-Secret -Text $_.Exception.Message)
    Write-Summary
    Write-VerifierHost "CLASSIFICATION=$classification"
    throw
}
finally {
    if ($sessionId) {
        try {
            $deleteHeaders = @{ Authorization = "Bearer $Token"; 'Mcp-Session-Id' = $sessionId }
            [void](Invoke-WebRequest -Uri "$BaseUri/mcp" -Method Delete -Headers $deleteHeaders -SkipHttpErrorCheck -TimeoutSec 15)
        }
        catch {
            # Best-effort only -- the idle-session reaper (src/http.ts) cleans
            # this up eventually either way.
            Write-VerifierHost "Session cleanup (DELETE) failed, ignoring: $($_.Exception.Message)"
        }
    }
}

Add-SummaryLine 'Classification: **verified**'
Add-SummaryLine ''
Add-SummaryLine "Instance ID: ``$(Get-OptionalProperty -Object $healthResult.Snapshot -Name 'instanceId')``"
Add-SummaryLine "Started at: ``$(Get-OptionalProperty -Object $healthResult.Snapshot -Name 'startedAt')``"
Add-SummaryLine "Capability profile: ``$(Get-OptionalProperty -Object $repoStatusData -Name 'capabilityProfile')``"
Add-SummaryLine "Tools observed: $($toolNames.Count) (all required tools present: $($RequiredTool -join ', '))"
Write-Summary

Write-VerifierHost 'CLASSIFICATION=verified'
Write-VerifierHost "The public runtime at '$BaseUri' is confirmed serving revision '$ExpectedRevision' with the expected write-capable MCP catalog."
