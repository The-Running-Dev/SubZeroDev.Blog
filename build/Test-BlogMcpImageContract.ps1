<#
.SYNOPSIS
Parity check between tools/blog-mcp/Dockerfile, tools/blog-mcp/.dockerignore,
and the change-area classifier's blog_mcp_image pattern list.

.DESCRIPTION
Fails if any of the three drift apart: every real Dockerfile COPY source
must exist, must not be excluded by .dockerignore, and must classify as
blog_mcp_image; every file matching a blog_mcp_image pattern must be
reachable from some COPY instruction and must not be excluded by
.dockerignore. Also asserts a checked-in list of paths that must always be
excluded (credentials, docs, test fixtures, nested node_modules/dist) --
each one a regression that has genuinely been live in this repository.

Separate from build/Test-WorkflowChangeAreas.ps1 on purpose: that suite's
path-classification and git-parsing tiers are deliberately filesystem-free,
and this test is fundamentally about on-disk state. No PowerShell test
framework (Pester or otherwise) is used anywhere in this repository, so this
follows the same findings-array-and-throw shape as build/Test-Documentation.ps1
and build/Test-WorkflowChangeAreas.ps1 rather than introducing one.

.PARAMETER Filter
Only run fixtures whose name contains this substring.
#>
[CmdletBinding()]
param (
    [Parameter()]
    [string] $Filter
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

function Find-ImageContractRepositoryRoot {
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

$repositoryRoot = $null
foreach ($start in @($PSScriptRoot, (Get-Location).Path)) {
    if ([string]::IsNullOrWhiteSpace($start)) { continue }
    try {
        $repositoryRoot = Find-ImageContractRepositoryRoot -StartPath $start
        break
    }
    catch [System.IO.DirectoryNotFoundException] {
        continue
    }
}
if (-not $repositoryRoot) {
    throw [System.IO.DirectoryNotFoundException]::new(
        "Could not locate the repository root from '$PSScriptRoot' or '$((Get-Location).Path)'."
    )
}

Import-Module (Join-Path $repositoryRoot 'build' 'WorkflowChangeAreas.psm1') -Force

$contextRoot = Join-Path $repositoryRoot 'tools' 'blog-mcp'
$dockerfilePath = Join-Path $contextRoot 'Dockerfile'
$dockerignorePath = Join-Path $contextRoot '.dockerignore'

function Test-FixtureIncluded {
    param (
        [Parameter(Mandatory)]
        [string] $Name
    )
    if ([string]::IsNullOrEmpty($Filter)) { return $true }
    return $Name.Contains($Filter)
}

function New-ImageContractFinding {
    param (
        [Parameter(Mandatory)] [string] $Fixture,
        [Parameter(Mandatory)] [string] $Severity,
        [Parameter(Mandatory)] [string] $Message
    )
    return [pscustomobject]@{ Fixture = $Fixture; Severity = $Severity; Message = $Message }
}

# ---------------------------------------------------------------------------
# .dockerignore parsing and matching (Docker semantics, not gitignore)
# ---------------------------------------------------------------------------

function Get-DockerIgnoreRule {
    param (
        [Parameter(Mandatory)]
        [string] $Path
    )

    $rule = [System.Collections.Generic.List[pscustomobject]]::new()
    $lineNumber = 0
    foreach ($rawLine in [IO.File]::ReadAllLines($Path)) {
        $lineNumber++
        $line = $rawLine.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }

        $negated = $false
        if ($line.StartsWith('!')) {
            $negated = $true
            $line = $line.Substring(1).Trim()
        }

        # Docker normalizes every pattern with filepath.Clean and strips a
        # leading separator: '/foo/' and 'foo' are the same rule.
        $pattern = $line.Replace('\', '/').Trim('/')
        if ($pattern -eq '' -or $pattern -eq '.') {
            throw "$Path line ${lineNumber}: '$rawLine' normalizes to an empty pattern."
        }

        $rule.Add([pscustomobject]@{
                LineNumber = $lineNumber
                Raw        = $rawLine
                Pattern    = $pattern
                Negated    = $negated
            })
    }
    return , $rule.ToArray()
}

function Test-DockerIgnorePath {
    <#
    .SYNOPSIS
    Docker's exclusion decision for one build-context-relative path.

    .DESCRIPTION
    Deliberately not a single call to Test-WorkflowPathPattern: Docker also
    excludes a path whose *ancestor directory* matches a pattern (a
    directory-shaped pattern with no trailing /** still prunes everything
    beneath it -- 'test' excludes 'test/post.test.ts'), and resolves
    multiple matching rules by last-match-wins, so a later '!' rule can
    un-exclude an earlier exclusion. The per-pattern glob translation itself
    is reused from the classifier module, since it already implements
    Docker's actual matching rules for '*'/'?'/'**' (verified, not assumed:
    '*' and '?' never cross '/', mid-pattern '**' is zero-or-more whole
    segments, a trailing '**' is one-or-more characters).
    #>
    param (
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [AllowEmptyCollection()] [object[]] $Rule
    )

    $normalized = $Path.Replace('\', '/').TrimStart('/')
    if ($normalized.StartsWith('./')) { $normalized = $normalized.Substring(2) }

    $segment = $normalized -split '/'
    $candidate = [System.Collections.Generic.List[string]]::new()
    for ($i = 0; $i -lt $segment.Count; $i++) {
        $candidate.Add(($segment[0..$i] -join '/'))
    }

    $excluded = $false
    foreach ($oneRule in $Rule) {
        $matched = $false
        foreach ($prefix in $candidate) {
            if (Test-WorkflowPathPattern -Path $prefix -Pattern @($oneRule.Pattern)) {
                $matched = $true
                break
            }
        }
        if ($matched) { $excluded = -not $oneRule.Negated }
    }
    return $excluded
}

# ---------------------------------------------------------------------------
# Dockerfile COPY/ADD parsing
# ---------------------------------------------------------------------------

function Get-DockerfileCopyInstruction {
    param (
        [Parameter(Mandatory)]
        [string] $Path
    )

    # Join continuation lines first: an instruction may span lines with a
    # trailing backslash, and reading it as separate lines could miss a COPY
    # entirely or misparse its operands.
    $logical = [System.Collections.Generic.List[pscustomobject]]::new()
    $buffer = ''
    $startLine = 0
    $lineNumber = 0
    foreach ($rawLine in [IO.File]::ReadAllLines($Path)) {
        $lineNumber++
        if ($buffer -eq '') {
            $trimmed = $rawLine.TrimStart()
            if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
            $startLine = $lineNumber
        }
        $right = $rawLine.TrimEnd()
        if ($right.EndsWith('\')) {
            $buffer += $right.Substring(0, $right.Length - 1) + ' '
            continue
        }
        $buffer += $right
        $logical.Add([pscustomobject]@{ LineNumber = $startLine; Text = $buffer.Trim() })
        $buffer = ''
    }
    if ($buffer -ne '') {
        throw "$Path ends with an unterminated line continuation."
    }

    $instruction = [System.Collections.Generic.List[pscustomobject]]::new()
    foreach ($entry in $logical) {
        if ($entry.Text -notmatch '^(?<verb>COPY|ADD)\s+(?<rest>.+)$') { continue }
        $verb = $Matches['verb']
        $rest = $Matches['rest'].Trim()

        # Legal Dockerfile syntax this parser does not implement. Throw
        # rather than silently skipping a COPY -- a skipped COPY is an
        # unverified one.
        if ($rest.StartsWith('[')) {
            throw "$Path line $($entry.LineNumber): JSON-array form '$verb' is not supported by this parser."
        }

        $token = @($rest -split '\s+' | Where-Object { $_ -ne '' })
        # Flags must precede operands, so consume the leading run only -- a
        # source path is allowed to start with '--'.
        $flagCount = 0
        while ($flagCount -lt $token.Count -and $token[$flagCount].StartsWith('--')) { $flagCount++ }
        $flag = @($token | Select-Object -First $flagCount)
        $operand = @($token | Select-Object -Skip $flagCount)
        if ($operand.Count -lt 2) {
            throw "$Path line $($entry.LineNumber): '$verb' has fewer than two operands."
        }

        $source = @($operand[0..($operand.Count - 2)] | ForEach-Object { $_.Replace('\', '/').TrimEnd('/') })
        $instruction.Add([pscustomobject]@{
                LineNumber  = $entry.LineNumber
                Verb        = $verb
                Source      = $source
                Destination = $operand[$operand.Count - 1]
                # '--from=<stage>' copies out of an earlier build stage, not
                # out of the build context, so .dockerignore never applies
                # and these are excluded from every context-based check below.
                FromStage   = ($flag | Where-Object { $_ -like '--from=*' } |
                        ForEach-Object { $_.Substring(7) } | Select-Object -First 1)
            })
    }
    return , $instruction.ToArray()
}

function Test-DockerBuildContextSourceExists {
    param (
        [Parameter(Mandatory)] [string] $ContextRoot,
        [Parameter(Mandatory)] [string] $Source
    )
    $literalPath = Join-Path $ContextRoot $Source
    if (Test-Path -LiteralPath $literalPath) { return $true }
    # Only reached for a source containing a glob -- none exist in the
    # current Dockerfile, but COPY sources are legally allowed to.
    $expanded = @(Get-ChildItem -Path (Join-Path $ContextRoot $Source) -ErrorAction SilentlyContinue)
    return $expanded.Count -gt 0
}

function Test-ReachableFromCopy {
    param (
        [Parameter(Mandatory)] [string] $RelativeToContext,
        [Parameter(Mandatory)] [AllowEmptyCollection()] [object[]] $CopyInstruction,
        [Parameter(Mandatory)] [string] $ContextRoot
    )
    foreach ($instruction in $CopyInstruction) {
        foreach ($source in $instruction.Source) {
            if ($RelativeToContext -eq $source) { return $true }
            $sourceOnDisk = Join-Path $ContextRoot $source
            if ((Test-Path -LiteralPath $sourceOnDisk -PathType Container -ErrorAction SilentlyContinue) -and
                $RelativeToContext.StartsWith("$source/")) {
                return $true
            }
        }
    }
    return $false
}

function Get-PrunedFile {
    <#
    Manual recursive walk that never descends into a pruned directory name,
    rather than Get-ChildItem -Recurse followed by a post-filter -- node_modules
    can hold tens of thousands of files, and enumerating it just to discard
    the results would make this test needlessly slow.
    #>
    param (
        [Parameter(Mandatory)] [string] $Root,
        [Parameter(Mandatory)] [string[]] $PruneDirectoryName
    )
    $result = [System.Collections.Generic.List[string]]::new()
    $stack = [System.Collections.Generic.Stack[string]]::new()
    $stack.Push($Root)
    while ($stack.Count -gt 0) {
        $current = $stack.Pop()
        foreach ($entry in [System.IO.Directory]::EnumerateFileSystemEntries($current)) {
            $name = [System.IO.Path]::GetFileName($entry)
            if ([System.IO.Directory]::Exists($entry)) {
                if ($PruneDirectoryName -contains $name) { continue }
                $stack.Push($entry)
            }
            else {
                $result.Add($entry)
            }
        }
    }
    return , $result.ToArray()
}

# ===========================================================================
# Fixtures
# ===========================================================================

$findings = [System.Collections.Generic.List[pscustomobject]]::new()

$ignoreRule = Get-DockerIgnoreRule -Path $dockerignorePath
$allCopyInstruction = Get-DockerfileCopyInstruction -Path $dockerfilePath
$copyInstruction = @($allCopyInstruction | Where-Object { -not $_.FromStage })

# --- matcher/* : self-test proving Docker semantics, not gitignore ---------

if (Test-FixtureIncluded -Name 'matcher/table') {
    $matcherFixture = @(
        @{ Pattern = 'dist'; Path = 'dist/x.js'; Expected = $true }
        @{ Pattern = 'dist'; Path = 'ui/dist/x.js'; Expected = $false }
        @{ Pattern = '**/dist'; Path = 'dist/x.js'; Expected = $true }
        @{ Pattern = '**/dist'; Path = 'ui/dist/x.js'; Expected = $true }
        @{ Pattern = '*.log'; Path = 'a.log'; Expected = $true }
        @{ Pattern = '*.log'; Path = 'ui/a.log'; Expected = $false }
        @{ Pattern = '**/*.log'; Path = 'ui/a.log'; Expected = $true }
        @{ Pattern = 'test'; Path = 'test/a.ts'; Expected = $true }
        @{ Pattern = 'test'; Path = 'src/test/a.ts'; Expected = $false }
        @{ Pattern = 'src/*.ts'; Path = 'src/a/b.ts'; Expected = $false }
    )
    foreach ($row in $matcherFixture) {
        $rule = @([pscustomobject]@{ Pattern = $row.Pattern; Negated = $false })
        $actual = Test-DockerIgnorePath -Path $row.Path -Rule $rule
        if ($actual -ne $row.Expected) {
            $findings.Add((New-ImageContractFinding -Fixture 'matcher/table' -Severity 'Error' `
                        -Message "Pattern '$($row.Pattern)' against '$($row.Path)': expected $($row.Expected), got $actual."))
        }
    }
}

if (Test-FixtureIncluded -Name 'matcher/last-match-wins') {
    $rule = @(
        [pscustomobject]@{ Pattern = '**/*.md'; Negated = $false }
        [pscustomobject]@{ Pattern = 'keep.md'; Negated = $true }
    )
    if (-not (Test-DockerIgnorePath -Path 'other.md' -Rule $rule)) {
        $findings.Add((New-ImageContractFinding -Fixture 'matcher/last-match-wins' -Severity 'Error' -Message "'other.md' should still be excluded by '**/*.md'."))
    }
    if (Test-DockerIgnorePath -Path 'keep.md' -Rule $rule) {
        $findings.Add((New-ImageContractFinding -Fixture 'matcher/last-match-wins' -Severity 'Error' -Message "'keep.md' should be un-excluded by the later '!keep.md' rule."))
    }
}

# --- copy/* : every real Dockerfile COPY source exists and isn't ignored ---

if (Test-FixtureIncluded -Name 'copy/source') {
    foreach ($instruction in $copyInstruction) {
        foreach ($source in $instruction.Source) {
            if (-not (Test-DockerBuildContextSourceExists -ContextRoot $contextRoot -Source $source)) {
                $findings.Add((New-ImageContractFinding -Fixture 'copy/source-exists' -Severity 'Error' `
                            -Message "Dockerfile line $($instruction.LineNumber): COPY source '$source' does not exist under the build context."))
                continue
            }
            if (Test-DockerIgnorePath -Path $source -Rule $ignoreRule) {
                $findings.Add((New-ImageContractFinding -Fixture 'copy/source-not-ignored' -Severity 'Error' `
                            -Message "Dockerfile line $($instruction.LineNumber): COPY source '$source' is excluded by .dockerignore -- the build would fail or silently omit it."))
            }
        }
    }
}

# --- classifier/copy-is-image-input/* : section 17.5's actual requirement --

if (Test-FixtureIncluded -Name 'classifier/copy-is-image-input') {
    foreach ($instruction in $copyInstruction) {
        foreach ($source in $instruction.Source) {
            $onDisk = Join-Path $contextRoot $source

            if (Test-Path -LiteralPath $onDisk -PathType Container) {
                # A directory source (e.g. `COPY ui/ ./`) is checked against
                # every REAL file .dockerignore would actually let through,
                # not a synthetic "any new file" probe: this directory may
                # deliberately enumerate specific files/subdirectories in
                # the classifier rather than a single catch-all (matching
                # how this pattern table elsewhere reserves a catch-all for
                # actual source directories and enumerates root-level config
                # files individually), so a blanket probe would demand a
                # broader pattern than is actually needed -- and, tried
                # once, produced exactly that false alarm: it flagged
                # ui/README.md/.oxlintrc.json/.gitignore, which
                # .dockerignore already, correctly, keeps out of the image.
                $onDiskFull = (Get-Item -LiteralPath $onDisk).FullName
                $realFile = Get-PrunedFile -Root $onDiskFull -PruneDirectoryName @('node_modules', 'dist')
                foreach ($fullPath in $realFile) {
                    $relativeToContext = "$source/" + $fullPath.Substring($onDiskFull.Length + 1).Replace('\', '/')
                    if (Test-DockerIgnorePath -Path $relativeToContext -Rule $ignoreRule) { continue }

                    $repoRelative = "tools/blog-mcp/$relativeToContext"
                    $result = Get-WorkflowChangeArea -ChangedPath @($repoRelative)
                    if (-not $result.Area.blog_mcp_image) {
                        $findings.Add((New-ImageContractFinding -Fixture 'classifier/copy-is-image-input' -Severity 'Error' `
                                    -Message "Dockerfile line $($instruction.LineNumber): COPY source '$source' includes real file '$repoRelative' (not excluded by .dockerignore) that does not classify as blog_mcp_image -- a change there would not rebuild the image."))
                    }
                }
                continue
            }

            $repoRelative = "tools/blog-mcp/$source"
            $result = Get-WorkflowChangeArea -ChangedPath @($repoRelative)
            if (-not $result.Area.blog_mcp_image) {
                $findings.Add((New-ImageContractFinding -Fixture 'classifier/copy-is-image-input' -Severity 'Error' `
                            -Message "Dockerfile line $($instruction.LineNumber): COPY source '$source' does not classify as blog_mcp_image -- a change there would not rebuild the image."))
            }
        }
    }
}

# --- classifier/pattern-is-image-file/* : the converse ---------------------

if (Test-FixtureIncluded -Name 'classifier/pattern-is-image-file') {
    # Hard-coded and deliberately independent of .dockerignore itself -- this
    # fixture exists to catch drift in .dockerignore, so its own filesystem
    # walk must not depend on the file under test to decide what to skip.
    $pruneDirectory = @('node_modules', 'dist', '.git')
    foreach ($name in $pruneDirectory) {
        if (-not (Test-DockerIgnorePath -Path $name -Rule $ignoreRule)) {
            $findings.Add((New-ImageContractFinding -Fixture 'classifier/pattern-is-image-file' -Severity 'Error' `
                        -Message "Prune entry '$name' is assumed dockerignored by this fixture's own filesystem walk, but .dockerignore does not exclude it -- the prune list and .dockerignore have drifted."))
        }
    }

    # Dockerfile and .dockerignore are build-PROCESS inputs, not application
    # content: changing either one genuinely should rebuild the image (so
    # both are correctly blog_mcp_image), but neither is ever a literal COPY
    # source. Exempt only these two from the reachability check below.
    $buildProcessFile = @('Dockerfile', '.dockerignore')

    $imagePattern = (Get-WorkflowChangeAreaDefinition)['blog_mcp_image']
    $contextRootFull = (Get-Item -LiteralPath $contextRoot).FullName
    $everyFile = Get-PrunedFile -Root $contextRootFull -PruneDirectoryName $pruneDirectory

    foreach ($fullPath in $everyFile) {
        $relativeToContext = $fullPath.Substring($contextRootFull.Length + 1).Replace('\', '/')
        $repoRelative = "tools/blog-mcp/$relativeToContext"
        if (-not (Test-WorkflowPathPattern -Path $repoRelative -Pattern $imagePattern)) { continue }

        # A blog_mcp_image match that IS dockerignored is over-inclusive, not
        # wrong: it's the same "unknown/uncertain paths default to
        # validation" direction this whole classifier is built around (e.g.
        # tools/blog-mcp/ui/** correctly covers the whole ui/ directory the
        # Dockerfile's `COPY ui/ ./` operates over, including a few files --
        # ui/README.md, ui/.oxlintrc.json, ui/.gitignore -- that
        # .dockerignore separately, correctly, keeps out of the actual
        # context). Only a file that would truly enter the build needs the
        # reachability check; a dockerignored one is out of scope here by
        # definition, not a defect. copy/source-not-ignored, above, is what
        # actually guards "declared COPY source contradicted by
        # .dockerignore".
        if (Test-DockerIgnorePath -Path $relativeToContext -Rule $ignoreRule) { continue }
        if ($relativeToContext -in $buildProcessFile) { continue }

        if (-not (Test-ReachableFromCopy -RelativeToContext $relativeToContext -CopyInstruction $copyInstruction -ContextRoot $contextRoot)) {
            $findings.Add((New-ImageContractFinding -Fixture 'classifier/pattern-is-image-file' -Severity 'Error' `
                        -Message "'$repoRelative' matches a blog_mcp_image pattern, is not excluded by .dockerignore, but is not reachable from any Dockerfile COPY instruction."))
        }
    }
}

# --- dockerignore/must-exclude/* : the over-permissiveness / regression list -

if (Test-FixtureIncluded -Name 'dockerignore/must-exclude') {
    # Synthetic, not filesystem-derived -- deterministic regardless of what
    # currently exists on disk. Each entry is a regression that has actually
    # been possible in this repository before this test existed.
    $mustExclude = @(
        '.env'
        '.env.example'
        '.env.ci'
        'docker-compose.yml'
        'README.md'
        'MCP-NEXT.md'
        'TODO-NEXT.md'
        'ui/README.md'
        'ui/.oxlintrc.json'
        'ui/.gitignore'
        'test/post.test.ts'
        'node_modules/a/index.js'
        'ui/node_modules/a/index.js'
        'dist/index.js'
        'ui/dist/index.html'
        'watch/dropped.md'
        'coverage/index.html'
        'debug.log'
        'ui/debug.log'
        '.git/config'
    )
    foreach ($path in $mustExclude) {
        if (-not (Test-DockerIgnorePath -Path $path -Rule $ignoreRule)) {
            $findings.Add((New-ImageContractFinding -Fixture 'dockerignore/must-exclude' -Severity 'Error' -Message "'$path' should be excluded by .dockerignore but is not."))
        }
    }
}

# --- dockerignore/no-exception-rule : guards the matcher's own assumption --

if (Test-FixtureIncluded -Name 'dockerignore/no-exception-rule') {
    $negatedRule = @($ignoreRule | Where-Object { $_.Negated })
    if ($negatedRule.Count -gt 0) {
        $patternList = ($negatedRule | ForEach-Object { $_.Pattern }) -join ', '
        $findings.Add((New-ImageContractFinding -Fixture 'dockerignore/no-exception-rule' -Severity 'Error' `
                    -Message "$($negatedRule.Count) '!' exception rule(s) found in .dockerignore ($patternList) -- Test-DockerIgnorePath's simplifying last-match-wins assumption needs re-review before this is safe."))
    }
}

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

if ($findings.Count -gt 0) {
    foreach ($finding in $findings | Sort-Object Fixture) {
        Write-Host "$($finding.Fixture) [$($finding.Severity)]: $($finding.Message)"
    }
}

$blockingFinding = @($findings | Where-Object Severity -ne 'Warning')
if ($blockingFinding.Count -gt 0) {
    throw "Image contract checks failed with $($blockingFinding.Count) error(s)."
}

Write-Host 'Image contract checks passed.' -ForegroundColor Green
