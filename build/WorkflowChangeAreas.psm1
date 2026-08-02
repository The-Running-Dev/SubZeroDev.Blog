<#
.SYNOPSIS
Classifies a Git diff into named change areas for CI workflow gating.

.DESCRIPTION
Implements the change-area classifier specified in
tools/blog-mcp/TODO-NEXT.md sections 15-22: given the set of paths changed
between two refs, decides which of a fixed set of named areas
(markdown_gate, site_verify, site_deploy, blog_mcp_test, blog_mcp_image,
blog_mcp_compose, workflow_definition) applies, so a workflow can skip
inapplicable expensive jobs without ever leaving a required status check
permanently pending.

This module is pure logic plus a thin git-invocation layer; it never calls
GitHub's REST API (whose changed-file list truncates at 300 entries) and
never leaves an unrecognized diff record or malformed pattern to fail open
-- every error path here fails closed (throws) rather than silently
classifying nothing or guessing.

Deliberately not shared with build/Test-Documentation.ps1's
Find-DocumentationRepositoryRoot: that script is installed standalone into
a published image with no repo-local module available, so this module
duplicates the same repo-root walk rather than depending on it.
#>

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Repository root resolution
# ---------------------------------------------------------------------------

function Find-WorkflowRepositoryRoot {
    <#
    .SYNOPSIS
    Walks upward from a starting path to the nearest directory containing
    '.git', which may be a directory (a normal clone) or a file (a worktree
    or submodule).
    #>
    param (
        [Parameter(Mandatory)]
        [string] $StartPath
    )

    $current = [IO.Path]::GetFullPath($StartPath)
    while ($true) {
        if (Test-Path -LiteralPath (Join-Path $current '.git')) {
            return $current
        }

        $parent = Split-Path -Parent $current
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $current) {
            throw [System.IO.DirectoryNotFoundException]::new(
                "Could not locate the repository root above '$StartPath': no '.git' was found in any parent directory."
            )
        }
        $current = $parent
    }
}

# ---------------------------------------------------------------------------
# Glob-to-regex translation
# ---------------------------------------------------------------------------

function ConvertTo-WorkflowPathRegex {
    <#
    .SYNOPSIS
    Translates one change-area glob pattern into an anchored regex source.

    .DESCRIPTION
    PowerShell's own wildcard support does not understand '**' as "match
    across path segments" -- 'docs/*' would match 'docs/a/b/c.md'. This
    implements the narrower semantics change-area patterns and GitHub
    Actions 'paths:' filters both use:
      - '**' as a whole path segment: mid-pattern becomes "zero or more
        whole segments" (each consuming its own trailing '/'); as the final
        segment it becomes "one or more characters, may cross '/'".
      - '*' and '?' inside a segment match within that segment only, never
        crossing '/'.
      - every other character is a case-sensitive literal.

    Case-sensitive throughout: git records committed casing and GitHub
    Actions runners are Linux, so case-insensitive matching here would let
    a local Windows run disagree with what Actions actually does.

    Fails closed on a malformed pattern (an empty segment from a leading,
    trailing, or doubled '/', or '**' embedded inside a larger segment)
    rather than silently guessing a translation.
    #>
    param (
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string] $Pattern
    )

    $normalized = $Pattern.Replace('\', '/')
    $segments = $normalized -split '/'

    foreach ($segment in $segments) {
        if ([string]::IsNullOrEmpty($segment)) {
            throw "Malformed change-area pattern '$Pattern': empty path segment (leading, trailing, or doubled '/')."
        }
        if ($segment.Contains('**') -and $segment -ne '**') {
            throw "Malformed change-area pattern '$Pattern': '**' must be a whole path segment, not embedded in '$segment'."
        }
    }

    $regexBuilder = [System.Text.StringBuilder]::new('^')
    for ($index = 0; $index -lt $segments.Count; $index++) {
        $segment = $segments[$index]
        $isLastSegment = ($index -eq $segments.Count - 1)

        if ($segment -eq '**') {
            if ($isLastSegment) {
                [void] $regexBuilder.Append('.+')
            }
            else {
                [void] $regexBuilder.Append('(?:[^/]+/)*')
            }
            continue
        }

        foreach ($character in $segment.ToCharArray()) {
            switch ($character) {
                '*' { [void] $regexBuilder.Append('[^/]*') }
                '?' { [void] $regexBuilder.Append('[^/]') }
                default { [void] $regexBuilder.Append([regex]::Escape([string] $character)) }
            }
        }

        if (-not $isLastSegment) {
            [void] $regexBuilder.Append('/')
        }
    }
    [void] $regexBuilder.Append('$')

    return $regexBuilder.ToString()
}

$script:CompiledPatternCache = @{}

function Get-CompiledWorkflowPathRegex {
    param (
        [Parameter(Mandatory)]
        [string] $Pattern
    )

    if (-not $script:CompiledPatternCache.ContainsKey($Pattern)) {
        $regexSource = ConvertTo-WorkflowPathRegex -Pattern $Pattern
        $options = [System.Text.RegularExpressions.RegexOptions]::Compiled -bor [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
        $script:CompiledPatternCache[$Pattern] = [regex]::new($regexSource, $options)
    }

    return $script:CompiledPatternCache[$Pattern]
}

function Test-WorkflowPathPattern {
    <#
    .SYNOPSIS
    Tests whether one repo-relative path matches any of a set of change-area
    glob patterns.
    #>
    param (
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string] $Path,

        [Parameter(Mandatory)]
        [string[]] $Pattern
    )

    $normalizedPath = $Path.Replace('\', '/')
    if ($normalizedPath.StartsWith('./')) {
        $normalizedPath = $normalizedPath.Substring(2)
    }

    foreach ($onePattern in $Pattern) {
        $regex = Get-CompiledWorkflowPathRegex -Pattern $onePattern
        if ($regex.IsMatch($normalizedPath)) {
            return $true
        }
    }

    return $false
}

# ---------------------------------------------------------------------------
# Area pattern table
#
# Built from shared arrays rather than independent lists, so the two subset
# relationships the spec requires cannot drift out of sync with this table:
#   - site_verify is a superset of site_deploy (a change under docs/** is
#     always both; build/Test-DocumentationArtifact.ps1 is site_verify-only,
#     since a validation-script-only change verifies but doesn't need to
#     redeploy an identical artifact).
#   - blog_mcp_test is a superset of blog_mcp_image (every image input is
#     also a test input; test/** and package/build config are additional).
# ---------------------------------------------------------------------------

$script:BlogMcpImagePattern = @(
    'tools/blog-mcp/Dockerfile'
    'tools/blog-mcp/docker-entrypoint.sh'
    'tools/blog-mcp/.dockerignore'
    'tools/blog-mcp/package.json'
    'tools/blog-mcp/package-lock.json'
    'tools/blog-mcp/tsconfig.json'
    'tools/blog-mcp/src/**'
    'tools/blog-mcp/ui/package.json'
    'tools/blog-mcp/ui/package-lock.json'
    'tools/blog-mcp/ui/tsconfig*.json'
    'tools/blog-mcp/ui/vite.config.ts'
    'tools/blog-mcp/ui/index.html'
    'tools/blog-mcp/ui/public/**'
    'tools/blog-mcp/ui/src/**'
)

# The classifier's own implementation is deliberately a member of every area
# whose gate it could break if it silently misclassified itself.
$script:ClassifierPattern = @(
    'build/WorkflowChangeAreas.psm1'
    'build/Test-WorkflowChangeAreas.ps1'
    'build/Get-WorkflowChangeArea.ps1'
)

$script:SiteDeployPattern = @(
    'docs/**'
)

$script:AreaDefinition = [ordered]@{
    markdown_gate = @(
        '**/*.md'
        '.config/DocumentationRules.psd1'
        'build/Test-Documentation.ps1'
    ) + $script:ClassifierPattern

    # Union, never exclusion: build/Test-DocumentationArtifact.ps1 is not
    # under docs/**, so it lands here and only here with no special-casing.
    # docs-ci.yml/docs-deploy.yml are included here (editing them should
    # re-verify the site build) but deliberately not in site_deploy (editing
    # them alone shouldn't force a redeploy) -- reading TODO-NEXT.md
    # section 17.2's "generated-workflow changes that alter the build path"
    # narrowly. One-line change if that reading is wrong.
    site_verify = $script:SiteDeployPattern + @(
        'build/Test-DocumentationArtifact.ps1'
        '.github/workflows/docs-ci.yml'
        '.github/workflows/docs-deploy.yml'
    )

    site_deploy = $script:SiteDeployPattern

    blog_mcp_image = $script:BlogMcpImagePattern

    blog_mcp_test = $script:BlogMcpImagePattern + @(
        'tools/blog-mcp/test/**'
        'tools/blog-mcp/vitest.config.*'
        '.github/workflows/blog-mcp-image.yml'
    ) + $script:ClassifierPattern

    blog_mcp_compose = @(
        'docker-compose.yml'
        'tools/blog-mcp/docker-compose.yml'
        '**/.env.example'
        'tools/blog-mcp/.env.ci'
    )

    workflow_definition = @('.github/workflows/**') + $script:ClassifierPattern
}

function Get-WorkflowChangeAreaDefinition {
    <#
    .SYNOPSIS
    Returns the change-area name -> glob pattern list table.
    #>
    [CmdletBinding()]
    param ()

    return $script:AreaDefinition
}

# ---------------------------------------------------------------------------
# Pure classification
# ---------------------------------------------------------------------------

function Get-WorkflowChangeArea {
    <#
    .SYNOPSIS
    Classifies a set of changed paths into named change areas.

    .DESCRIPTION
    Pure function: takes a path list directly rather than talking to git, so
    it is fast and deterministic to unit test with fixture path arrays. See
    Get-WorkflowChangePath for the git-backed caller.

    Unknown paths (matching no area) never activate any area -- "unknown
    paths default to validation, not deployment" -- and are reported
    separately in UnmatchedPath so that default is visible, not silent.
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [AllowEmptyString()]
        [string[]] $ChangedPath,

        [Parameter()]
        [AllowNull()]
        [string] $Base,

        [Parameter()]
        [AllowNull()]
        [string] $Head,

        [Parameter()]
        [AllowNull()]
        [string] $BaseCommit,

        [Parameter()]
        [AllowNull()]
        [string] $HeadCommit,

        [Parameter()]
        [string[]] $MergeBase = @()
    )

    # Sort-Object -Unique compares case-insensitively by default, which
    # would silently collapse two distinct git paths that differ only by
    # case (a real possibility on the case-sensitive Linux runners this
    # module targets) into one. Dedupe with an ordinal HashSet first, then
    # sort purely for stable, readable output -- ordering doesn't affect
    # correctness, only uniqueness does.
    $uniquePath = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($rawPath in $ChangedPath) {
        $value = $rawPath.Replace('\', '/')
        if ($value.StartsWith('./')) { $value = $value.Substring(2) }
        if ($value -ne '') { [void] $uniquePath.Add($value) }
    }
    $normalizedPath = @($uniquePath | Sort-Object)

    $definition = Get-WorkflowChangeAreaDefinition
    $area = [ordered]@{}
    $matchedPath = [ordered]@{}
    $matchedAnyArea = [System.Collections.Generic.HashSet[string]]::new()

    foreach ($areaName in $definition.Keys) {
        $pattern = $definition[$areaName]
        $matchingPaths = @($normalizedPath | Where-Object { Test-WorkflowPathPattern -Path $_ -Pattern $pattern })
        $area[$areaName] = ($matchingPaths.Count -gt 0)
        $matchedPath[$areaName] = $matchingPaths
        foreach ($matchedOne in $matchingPaths) {
            [void] $matchedAnyArea.Add($matchedOne)
        }
    }

    $unmatchedPath = @($normalizedPath | Where-Object { -not $matchedAnyArea.Contains($_) })

    return [pscustomobject]@{
        Schema           = 'workflow-change-areas/v1'
        Base             = $Base
        Head             = $Head
        BaseCommit       = $BaseCommit
        HeadCommit       = $HeadCommit
        MergeBase        = @($MergeBase)
        ChangedPathCount = $normalizedPath.Count
        ChangedPath      = $normalizedPath
        Area             = $area
        MatchedPath      = $matchedPath
        UnmatchedPath    = $unmatchedPath
    }
}

# ---------------------------------------------------------------------------
# Git '--name-status -z' parsing
# ---------------------------------------------------------------------------

function ConvertFrom-GitNameStatusRecord {
    <#
    .SYNOPSIS
    Parses raw 'git diff --name-status -z' output into structured records.

    .DESCRIPTION
    Pure function: takes the raw NUL-separated text directly, so parsing
    correctness (renames, copies, deletes, malformed input) is testable
    with synthetic strings and needs no real git process.

    Splits on NUL only, never newline -- a path may legally contain a
    literal newline, and splitting on it would silently corrupt the path
    list. Dispatches on the leading status letter: 'R'/'C' (rename/copy)
    records carry two path fields (old, new); 'A'/'D'/'M'/'T' carry one.
    Any other status code, or a record truncated before its expected field
    count, throws rather than being silently dropped -- an unrecognized
    record must fail validation, never disappear.
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string] $NameStatusOutput
    )

    if ([string]::IsNullOrEmpty($NameStatusOutput)) {
        # The leading comma matters: a bare empty array returned from a
        # function is unwrapped to $null by PowerShell's output pipeline,
        # not preserved as a zero-length array.
        return , @()
    }

    $rawFields = $NameStatusOutput.Split([char] 0)
    $fields = if ($rawFields.Count -gt 0 -and $rawFields[$rawFields.Count - 1] -eq '') {
        if ($rawFields.Count -eq 1) { @() } else { $rawFields[0..($rawFields.Count - 2)] }
    }
    else {
        $rawFields
    }

    if ($fields.Count -eq 0) {
        return , @()
    }

    $records = [System.Collections.Generic.List[pscustomobject]]::new()
    $index = 0
    while ($index -lt $fields.Count) {
        $status = $fields[$index]
        if ([string]::IsNullOrEmpty($status)) {
            throw "Malformed git name-status output: empty status field at record index $index."
        }

        $letter = $status.Substring(0, 1)
        $score = $null
        if ($status.Length -gt 1) {
            $parsedScore = 0
            if ([int]::TryParse($status.Substring(1), [ref] $parsedScore)) {
                $score = $parsedScore
            }
        }

        switch -CaseSensitive ($letter) {
            { $_ -eq 'R' -or $_ -eq 'C' } {
                if ($index + 2 -ge $fields.Count) {
                    throw "Malformed git name-status output: truncated '$letter' record at index $index (expected two path fields)."
                }
                $records.Add([pscustomobject]@{
                        Status  = $letter
                        Score   = $score
                        OldPath = $fields[$index + 1]
                        Path    = $fields[$index + 2]
                    })
                $index += 3
            }
            { $_ -eq 'A' -or $_ -eq 'D' -or $_ -eq 'M' -or $_ -eq 'T' } {
                if ($index + 1 -ge $fields.Count) {
                    throw "Malformed git name-status output: truncated '$letter' record at index $index (expected one path field)."
                }
                $records.Add([pscustomobject]@{
                        Status  = $letter
                        Score   = $score
                        OldPath = $null
                        Path    = $fields[$index + 1]
                    })
                $index += 2
            }
            default {
                throw "Unrecognized git name-status code '$status' at record index $index."
            }
        }
    }

    return , $records.ToArray()
}

# ---------------------------------------------------------------------------
# Git invocation
# ---------------------------------------------------------------------------

function Invoke-GitCommand {
    <#
    .SYNOPSIS
    Runs 'git' with an explicit argv array and returns its captured output.

    .DESCRIPTION
    Deliberately does not use PowerShell's native-command capture
    ($out = git ...): that splits stdout on newlines into a string array,
    which would silently corrupt '-z' (NUL-separated) output containing a
    path with a literal newline, and applies [Console]::OutputEncoding,
    which is not reliably UTF-8 on Windows. Uses ProcessStartInfo directly
    with an explicit ArgumentList (never a shell string) and forced UTF-8
    stream encoding instead.

    Reads stdout and stderr asynchronously before WaitForExit: a diff large
    enough to fill the OS pipe buffer would otherwise deadlock the process
    waiting for a reader that never arrives -- exactly the risk on a large
    (>300-file) diff.

    Throws on a non-zero exit, carrying the command, exit code, and stderr.
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [string] $RepositoryRoot,

        [Parameter(Mandatory)]
        [string[]] $ArgumentList
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'git'
    foreach ($argument in $ArgumentList) {
        [void] $startInfo.ArgumentList.Add($argument)
    }
    $startInfo.WorkingDirectory = $RepositoryRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    $startInfo.StandardOutputEncoding = $utf8NoBom
    $startInfo.StandardErrorEncoding = $utf8NoBom
    # Never let a credential prompt hang a CI job or a local run.
    $startInfo.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'

    $process = [System.Diagnostics.Process]::new()
    try {
        $process.StartInfo = $startInfo
        [void] $process.Start()

        $stdOutTask = $process.StandardOutput.ReadToEndAsync()
        $stdErrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()

        $stdOut = $stdOutTask.GetAwaiter().GetResult()
        $stdErr = $stdErrTask.GetAwaiter().GetResult()
        $exitCode = $process.ExitCode
    }
    finally {
        $process.Dispose()
    }

    if ($exitCode -ne 0) {
        throw "git $($ArgumentList -join ' ') failed (exit $exitCode): $($stdErr.Trim())"
    }

    return [pscustomobject]@{
        Command  = @('git') + $ArgumentList
        ExitCode = $exitCode
        StdOut   = $stdOut
        StdErr   = $stdErr
    }
}

function Resolve-GitCommit {
    <#
    .SYNOPSIS
    Resolves a ref to its 40-character commit SHA, validated.
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [string] $RepositoryRoot,

        [Parameter(Mandatory)]
        [string] $Ref
    )

    try {
        $result = Invoke-GitCommand -RepositoryRoot $RepositoryRoot -ArgumentList @('rev-parse', '--verify', "$Ref^{commit}")
    }
    catch {
        throw "Could not resolve '$Ref' to a commit: $($_.Exception.Message)"
    }

    $sha = $result.StdOut.Trim()
    if ($sha -notmatch '^[0-9a-f]{40}$') {
        throw "git rev-parse for '$Ref' did not return a 40-character commit SHA: '$sha'"
    }

    return $sha
}

function Get-WorkflowChangePath {
    <#
    .SYNOPSIS
    Returns every path changed between two refs, using their merge base(s)
    rather than a raw two-ref diff.

    .DESCRIPTION
    Resolves Base and Head to commit SHAs, then diffs each of their merge
    bases (git merge-base --all -- normally exactly one, but a criss-cross
    history can have more, handled as a union rather than guessing) against
    Head. This is the direct fix for a real bug class: a plain base..head
    diff against a base branch that has moved since the compared branch
    diverged spuriously attributes unrelated later commits on base to the
    comparison.

    Uses --no-renames on the real diff: diff.renames/diff.renameLimit are
    user-config-dependent, which would otherwise make a developer's local
    run disagree with what Actions produces. --no-renames turns every
    rename into an add+delete pair unconditionally, which also gives the
    wanted semantics for free -- both the old and new path count toward
    classification, so a file leaving a production directory doesn't
    silently escape detection.

    Throws with an actionable message when no merge base exists -- the
    real failure shape of a shallow checkout (actions/checkout defaults to
    fetch-depth: 1).
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [string] $RepositoryRoot,

        [Parameter(Mandatory)]
        [string] $Base,

        [Parameter(Mandatory)]
        [string] $Head
    )

    $baseCommit = Resolve-GitCommit -RepositoryRoot $RepositoryRoot -Ref $Base
    $headCommit = Resolve-GitCommit -RepositoryRoot $RepositoryRoot -Ref $Head

    try {
        $mergeBaseResult = Invoke-GitCommand -RepositoryRoot $RepositoryRoot -ArgumentList @('merge-base', '--all', $baseCommit, $headCommit)
    }
    catch {
        throw "Could not find a merge base between '$Base' ($baseCommit) and '$Head' ($headCommit): $($_.Exception.Message). If this is a shallow checkout, fetch full history (fetch-depth: 0) or fetch the base ref before classifying."
    }

    $mergeBase = @(
        $mergeBaseResult.StdOut -split "`n" |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -ne '' } |
            Sort-Object -Unique
    )

    if ($mergeBase.Count -eq 0) {
        throw "No merge base found between '$Base' ($baseCommit) and '$Head' ($headCommit). If this is a shallow checkout, fetch full history (fetch-depth: 0) or fetch the base ref before classifying."
    }

    $allPath = [System.Collections.Generic.HashSet[string]]::new()
    foreach ($oneMergeBase in $mergeBase) {
        $diffResult = Invoke-GitCommand -RepositoryRoot $RepositoryRoot -ArgumentList @('diff', '--name-status', '-z', '--no-renames', $oneMergeBase, $headCommit, '--')
        $records = ConvertFrom-GitNameStatusRecord -NameStatusOutput $diffResult.StdOut
        foreach ($record in $records) {
            if ($record.Path) { [void] $allPath.Add($record.Path) }
            if ($record.OldPath) { [void] $allPath.Add($record.OldPath) }
        }
    }

    return [pscustomobject]@{
        Base       = $Base
        Head       = $Head
        BaseCommit = $baseCommit
        HeadCommit = $headCommit
        MergeBase  = $mergeBase
        Path       = @($allPath | Sort-Object)
    }
}

# ---------------------------------------------------------------------------
# Presentation
# ---------------------------------------------------------------------------

function Format-WorkflowChangeAreaSummary {
    <#
    .SYNOPSIS
    Renders a Get-WorkflowChangeArea result as a human-readable diagnostic
    summary listing the paths that activated each area.
    #>
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [pscustomobject] $Result
    )

    $lines = [System.Collections.Generic.List[string]]::new()
    $rangeLabel = if ($Result.Base -and $Result.Head) { "$($Result.Base)...$($Result.Head)" } else { '(explicit path list)' }
    $lines.Add("Change areas for $rangeLabel")

    if ($Result.BaseCommit -or $Result.HeadCommit) {
        $baseShort = if ($Result.BaseCommit) { $Result.BaseCommit.Substring(0, 7) } else { '(none)' }
        $headShort = if ($Result.HeadCommit) { $Result.HeadCommit.Substring(0, 7) } else { '(none)' }
        $mergeBaseShort = if ($Result.MergeBase -and $Result.MergeBase.Count -gt 0) {
            ($Result.MergeBase | ForEach-Object { $_.Substring(0, 7) }) -join ', '
        }
        else {
            '(none)'
        }
        $lines.Add("  base $baseShort  head $headShort  merge-base $mergeBaseShort")
    }

    $lines.Add("  $($Result.ChangedPathCount) changed path(s), $($Result.UnmatchedPath.Count) unmatched")
    $lines.Add('')

    foreach ($areaName in $Result.Area.Keys) {
        $isActive = $Result.Area[$areaName]
        $paths = @($Result.MatchedPath[$areaName])
        $marker = if ($isActive) { '[x]' } else { '[ ]' }
        $lines.Add("  $marker $($areaName.PadRight(20)) $($paths.Count) path(s)")
        if ($paths.Count -gt 0) {
            $displayCount = [Math]::Min(3, $paths.Count)
            for ($i = 0; $i -lt $displayCount; $i++) {
                $lines.Add("        $($paths[$i])")
            }
            if ($paths.Count -gt $displayCount) {
                $remaining = $paths.Count - $displayCount - 1
                if ($remaining -gt 0) {
                    $lines.Add("        ... ($remaining more)")
                }
                $lines.Add("        $($paths[$paths.Count - 1])")
            }
        }
    }

    if ($Result.UnmatchedPath.Count -gt 0) {
        $lines.Add('')
        $lines.Add("  unmatched (no area):     $($Result.UnmatchedPath.Count) path(s)")
        foreach ($onePath in @($Result.UnmatchedPath | Select-Object -First 5)) {
            $lines.Add("        $onePath")
        }
    }

    return ($lines -join "`n")
}

Export-ModuleMember -Function @(
    'Find-WorkflowRepositoryRoot'
    'ConvertTo-WorkflowPathRegex'
    'Test-WorkflowPathPattern'
    'Get-WorkflowChangeAreaDefinition'
    'Get-WorkflowChangeArea'
    'ConvertFrom-GitNameStatusRecord'
    'Invoke-GitCommand'
    'Resolve-GitCommit'
    'Get-WorkflowChangePath'
    'Format-WorkflowChangeAreaSummary'
)
