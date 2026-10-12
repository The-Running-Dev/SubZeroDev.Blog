<#
.SYNOPSIS
Classifies the blog-mcp change areas for a workflow run and writes them to
$GITHUB_OUTPUT / $GITHUB_STEP_SUMMARY.

.DESCRIPTION
CI-only entry point for the `changes` job of .github/workflows/blog-mcp-image.yml
(this was an inline step in that file; it lives here so the workflow only ever
calls a script). It resolves the base ref for the event, runs
build/Get-WorkflowChangeArea.ps1 over base...HEAD, and emits one
`<area>=true|false` job output per blog-mcp area plus `forced`.

Inputs arrive as environment variables, never as parameters or interpolated
text, because github.base_ref is attacker-influenced on a fork PR:
  EVENT_NAME     github.event_name (push, pull_request or workflow_dispatch)
  PR_BASE_REF    github.base_ref
  PR_BASE_SHA    github.event.pull_request.base.sha
  PUSH_BEFORE    github.event.before
plus the runner's GITHUB_OUTPUT, GITHUB_STEP_SUMMARY and RUNNER_TEMP.

Run from the repository root with full history (actions/checkout fetch-depth: 0).
workflow_dispatch forces every area true. Any range that cannot be resolved
fails closed.
#>
[CmdletBinding()]
param ()

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
# PowerShell 7.4+ (what ubuntu-latest's shell: pwsh gives)
# defaults this to $true, which turns any non-zero native
# exit code into a terminating error under 'Stop'. The
# base-ref probe below deliberately runs `git rev-parse`
# expecting it to fail for an unresolvable candidate, so
# that has to be off here.
$PSNativeCommandUseErrorActionPreference = $false

$areaName = @('blog_mcp_test', 'blog_mcp_image', 'blog_mcp_compose')

function Write-JobOutput {
    param (
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [AllowEmptyString()] [string] $Value
    )
    if ($Value.Contains("`n") -or $Value.Contains("`r")) {
        throw "Refusing to write a multi-line value to GITHUB_OUTPUT for '$Name'."
    }
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "$Name=$Value" -Encoding utf8
}

# --- workflow_dispatch: forced, no git comparison ----------
# A manual run has no meaningful two-ref range to classify
# (it's the documented recovery/republish escape hatch, not
# a reaction to a diff), so it forces every area true rather
# than being fed a single ref the classifier can't diff.
if ($env:EVENT_NAME -eq 'workflow_dispatch') {
    Write-Host 'workflow_dispatch: forcing every blog-mcp change area true.'
    foreach ($name in $areaName) {
        Write-JobOutput -Name $name -Value 'true'
    }
    Write-JobOutput -Name 'forced' -Value 'true'
    Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value @'
### Change areas

Manual dispatch: **forced** -- every blog-mcp change area treated as applicable.
'@
    exit 0
}

# --- base ref candidates -----------------------------------
$candidateBase = [System.Collections.Generic.List[string]]::new()
switch ($env:EVENT_NAME) {
    'pull_request' {
        if (-not [string]::IsNullOrWhiteSpace($env:PR_BASE_REF)) {
            $candidateBase.Add("origin/$($env:PR_BASE_REF)")
        }
        # Exact base SHA as recorded when the PR last synced
        # -- a fallback for a base branch renamed or deleted
        # mid-review, where origin/<base_ref> no longer exists.
        if (-not [string]::IsNullOrWhiteSpace($env:PR_BASE_SHA)) {
            $candidateBase.Add($env:PR_BASE_SHA)
        }
    }
    'push' {
        $zeroSha = '0' * 40
        if (-not [string]::IsNullOrWhiteSpace($env:PUSH_BEFORE) -and $env:PUSH_BEFORE -ne $zeroSha) {
            $candidateBase.Add($env:PUSH_BEFORE)
        }
        # Covers what github.event.before can't describe: a
        # branch-creation push (all-zero 'before') and a
        # force-push whose recorded old tip is no longer
        # reachable in this clone. HEAD^ is main's own first
        # parent, which for both a merge commit and a
        # squash-merge commit is the previous tip.
        $candidateBase.Add('HEAD^')
    }
    default {
        throw "Unsupported event '$($env:EVENT_NAME)' for change-area classification."
    }
}

$base = $null
foreach ($candidate in $candidateBase) {
    git rev-parse --verify --quiet "$candidate^{commit}" *> $null
    if ($LASTEXITCODE -eq 0) { $base = $candidate; break }
    Write-Host "::warning::Base ref candidate '$candidate' does not resolve in this checkout; trying the next."
}
if (-not $base) {
    # Fail closed. A main push whose range can't be
    # established must not publish or redeploy on a guess;
    # workflow_dispatch is the recorded, forced recovery path.
    throw "None of the base ref candidates [$($candidateBase -join ', ')] resolved to a commit. Confirm actions/checkout used fetch-depth: 0, or re-run this workflow manually (workflow_dispatch) to force a full build."
}
Write-Host "Classifying '$base'...'HEAD' for event '$($env:EVENT_NAME)'."

# --- classify ---------------------------------------------
# -JsonPath rather than capturing stdout: as a child
# process, the wrapper's Write-Host summary and Write-Output
# JSON share one stream, so a file is the only unambiguous
# channel. It also keeps $LASTEXITCODE meaningful, which
# `& script.ps1` in-session would not.
$jsonPath = Join-Path $env:RUNNER_TEMP 'workflow-change-areas.json'
$wrapper = Join-Path $PSScriptRoot 'Get-WorkflowChangeArea.ps1'
pwsh -NoProfile -File $wrapper -Base $base -Head 'HEAD' -JsonPath $jsonPath | Write-Host
if ($LASTEXITCODE -ne 0) {
    throw "build/Get-WorkflowChangeArea.ps1 failed with exit code $LASTEXITCODE."
}

$result = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
if ($result.Schema -ne 'workflow-change-areas/v1') {
    throw "Unexpected classifier schema '$($result.Schema)'; this job understands 'workflow-change-areas/v1' only."
}

# --- outputs ----------------------------------------------
# Job outputs are always strings, so downstream `if:`
# conditions compare against the literal 'true'/'false'.
$summaryLine = [System.Collections.Generic.List[string]]::new()
$summaryLine.Add('### Change areas')
$summaryLine.Add('')
$summaryLine.Add("Range: ``$base``...``HEAD`` -- $($result.ChangedPathCount) changed path(s).")
$summaryLine.Add('')
$summaryLine.Add('| Area | Applicable | Matched paths |')
$summaryLine.Add('| --- | --- | --- |')

foreach ($name in $areaName) {
    $isTrue = [bool] $result.Area.$name
    $value = if ($isTrue) { 'true' } else { 'false' }
    Write-Host "  $($name.PadRight(18)) = $value"
    Write-JobOutput -Name $name -Value $value

    $matched = @($result.MatchedPath.$name)
    $shown = if ($matched.Count -eq 0) { '--' } else { ($matched | Select-Object -First 10 | ForEach-Object { "``$_``" }) -join '<br>' }
    if ($matched.Count -gt 10) { $shown += "<br>... and $($matched.Count - 10) more" }
    $summaryLine.Add("| ``$name`` | $value | $shown |")
}

Write-JobOutput -Name 'forced' -Value 'false'
Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value ($summaryLine -join "`n")
