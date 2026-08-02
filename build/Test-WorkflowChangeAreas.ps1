<#
.SYNOPSIS
Hand-rolled fixture suite for build/WorkflowChangeAreas.psm1.

.DESCRIPTION
No PowerShell test framework (Pester or otherwise) is used anywhere in this
repository, so this follows the same findings-array-and-throw shape as
build/Test-Documentation.ps1 rather than introducing one: each fixture
appends zero or more finding records, findings are printed sorted, and any
Error-severity finding fails the gate.

Three fixture tiers, fastest first:
  1. matrix/*, gate/*, classifier/*, workflow/*, glob/*, unknown/*,
     input/*, scale/*, meta/* -- pure path classification, no git.
  2. parse/* -- synthetic 'git diff --name-status -z' strings fed to the
     parser directly, no git.
  3. git/* -- real scratch git repositories, the only tier that needs an
     actual git process. Skippable with -SkipGitFixture for a fast inner
     loop; a skip still emits a visible Warning finding.

.PARAMETER Filter
Only run fixtures whose name contains this substring.

.PARAMETER SkipGitFixture
Skip the real-scratch-repository fixture tier (git/*).

.PARAMETER KeepScratch
Do not delete scratch repositories created by the git/* fixture tier, for
debugging a failure.
#>
[CmdletBinding()]
param (
    [Parameter()]
    [string] $Filter,

    [Parameter()]
    [switch] $SkipGitFixture,

    [Parameter()]
    [switch] $KeepScratch
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

function Find-ChangeAreaTestRepositoryRoot {
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
        $repositoryRoot = Find-ChangeAreaTestRepositoryRoot -StartPath $start
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

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

function New-ChangeAreaFinding {
    param (
        [Parameter(Mandatory)] [string] $Fixture,
        [Parameter(Mandatory)] [string] $Assertion,
        [Parameter(Mandatory)] [string] $Severity,
        [Parameter()] [string] $Expected = '',
        [Parameter()] [string] $Actual = '',
        [Parameter(Mandatory)] [string] $Message
    )
    return [pscustomobject]@{
        Fixture   = $Fixture
        Assertion = $Assertion
        Severity  = $Severity
        Expected  = $Expected
        Actual    = $Actual
        Message   = $Message
    }
}

function Test-FixtureIncluded {
    param (
        [Parameter(Mandatory)]
        [string] $Name
    )
    if ([string]::IsNullOrEmpty($Filter)) { return $true }
    return $Name.Contains($Filter)
}

# Every area seen true in at least one fixture during this run -- checked at
# the end by meta/area-coverage so a new area can't be added to the module
# without a fixture proving it can actually turn true.
$script:AreaSeenTrue = [System.Collections.Generic.HashSet[string]]::new()

function Test-AreaExpectation {
    <#
    For every defined area (not just the ones a fixture author remembers to
    list), asserts Area[name] equals (name -in ExpectedTrueArea), and that
    MatchedPath[name] is non-empty exactly when Area[name] is true.
    #>
    param (
        [Parameter(Mandatory)] [string] $Fixture,
        [Parameter(Mandatory)] [pscustomobject] $Result,
        [Parameter()] [string[]] $ExpectedTrueArea = @()
    )

    $findings = [System.Collections.Generic.List[pscustomobject]]::new()
    $definition = Get-WorkflowChangeAreaDefinition

    foreach ($expectedName in $ExpectedTrueArea) {
        if (-not $definition.Contains($expectedName)) {
            $findings.Add((New-ChangeAreaFinding -Fixture $Fixture -Assertion 'ExpectedAreaName' -Severity 'Error' `
                        -Message "Fixture declares expected-true area '$expectedName', which is not a real area name (typo?)."))
        }
    }

    foreach ($areaName in $definition.Keys) {
        $expected = $areaName -in $ExpectedTrueArea
        $actual = [bool] $Result.Area[$areaName]
        if ($actual) { [void] $script:AreaSeenTrue.Add($areaName) }

        if ($actual -ne $expected) {
            $findings.Add((New-ChangeAreaFinding -Fixture $Fixture -Assertion "Area:$areaName" -Severity 'Error' `
                        -Expected $expected -Actual $actual -Message "Area '$areaName' expected $expected but was $actual."))
        }

        $matchedCount = @($Result.MatchedPath[$areaName]).Count
        if (($matchedCount -gt 0) -ne $actual) {
            $findings.Add((New-ChangeAreaFinding -Fixture $Fixture -Assertion "AreaMatchedPathInvariant:$areaName" -Severity 'Error' `
                        -Message "Area '$areaName' is $actual but MatchedPath has $matchedCount entries -- these must always agree."))
        }
    }

    return , $findings.ToArray()
}

function Test-StringSetEqual {
    param (
        [Parameter(Mandatory)] [string] $Fixture,
        [Parameter(Mandatory)] [string] $Assertion,
        [Parameter()] [string[]] $Expected = @(),
        [Parameter()] [string[]] $Actual = @()
    )

    $expectedSet = [System.Collections.Generic.HashSet[string]]::new([string[]] $Expected)
    $actualSet = [System.Collections.Generic.HashSet[string]]::new([string[]] $Actual)
    if (-not $expectedSet.SetEquals($actualSet)) {
        return , @(New-ChangeAreaFinding -Fixture $Fixture -Assertion $Assertion -Severity 'Error' `
                -Expected ($Expected -join ', ') -Actual ($Actual -join ', ') `
                -Message "Set mismatch for '$Assertion': expected [$($Expected -join ', ')] but got [$($Actual -join ', ')].")
    }
    return , @()
}

function Test-ThrowsFixture {
    param (
        [Parameter(Mandatory)] [string] $Fixture,
        [Parameter(Mandatory)] [scriptblock] $ScriptBlock,
        [Parameter()] [string] $ExpectedMessagePattern
    )

    $threw = $false
    $actualMessage = $null
    try {
        & $ScriptBlock | Out-Null
    }
    catch {
        $threw = $true
        $actualMessage = $_.Exception.Message
    }

    if (-not $threw) {
        return , @(New-ChangeAreaFinding -Fixture $Fixture -Assertion 'Throws' -Severity 'Error' -Message 'Expected an error but none was thrown.')
    }
    if ($ExpectedMessagePattern -and $actualMessage -notmatch $ExpectedMessagePattern) {
        return , @(New-ChangeAreaFinding -Fixture $Fixture -Assertion 'ThrowsMessage' -Severity 'Error' `
                -Expected $ExpectedMessagePattern -Actual $actualMessage -Message 'Error message did not match the expected pattern.')
    }
    return , @()
}

# ---------------------------------------------------------------------------
# Tier 3 helpers: real scratch git repositories
# ---------------------------------------------------------------------------

function New-ChangeAreaScratchRepository {
    $scratchRoot = Join-Path ([IO.Path]::GetTempPath()) ('workflow-change-areas-' + [guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $scratchRoot -Force | Out-Null
    Invoke-GitCommand -RepositoryRoot $scratchRoot -ArgumentList @('init', '-b', 'main') | Out-Null
    Invoke-GitCommand -RepositoryRoot $scratchRoot -ArgumentList @('config', 'user.email', 'test@example.test') | Out-Null
    Invoke-GitCommand -RepositoryRoot $scratchRoot -ArgumentList @('config', 'user.name', 'Test') | Out-Null
    Invoke-GitCommand -RepositoryRoot $scratchRoot -ArgumentList @('config', 'core.autocrlf', 'false') | Out-Null
    return $scratchRoot
}

function Add-ChangeAreaScratchCommit {
    param (
        [Parameter(Mandatory)] [string] $RepositoryRoot,
        [Parameter(Mandatory)] [string] $Message,
        [Parameter()] [hashtable] $WriteFile = @{}
    )

    foreach ($relativePath in $WriteFile.Keys) {
        $fullPath = Join-Path $RepositoryRoot $relativePath
        $directory = Split-Path -Parent $fullPath
        if ($directory -and -not (Test-Path -LiteralPath $directory)) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
        }
        Set-Content -LiteralPath $fullPath -Value $WriteFile[$relativePath] -NoNewline -Encoding utf8
    }

    Invoke-GitCommand -RepositoryRoot $RepositoryRoot -ArgumentList @('add', '-A') | Out-Null
    Invoke-GitCommand -RepositoryRoot $RepositoryRoot -ArgumentList @('commit', '-m', $Message) | Out-Null
    return (Invoke-GitCommand -RepositoryRoot $RepositoryRoot -ArgumentList @('rev-parse', 'HEAD')).StdOut.Trim()
}

function Remove-ChangeAreaScratchRepository {
    param (
        [Parameter(Mandatory)]
        [string] $RepositoryRoot
    )

    if ($KeepScratch) {
        Write-Host "Keeping scratch repository at '$RepositoryRoot' (-KeepScratch)." -ForegroundColor Yellow
        return
    }

    # Windows: git pack/object files can be read-only, which blocks removal.
    Get-ChildItem -LiteralPath $RepositoryRoot -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object { -not $_.PSIsContainer } |
        ForEach-Object { $_.Attributes = 'Normal' }
    Remove-Item -LiteralPath $RepositoryRoot -Recurse -Force -ErrorAction SilentlyContinue
}

# ===========================================================================
# Fixtures
# ===========================================================================

$findings = [System.Collections.Generic.List[pscustomobject]]::new()

# --- Tier 1a: TODO-NEXT.md section 19 execution matrix, one fixture per row (plus splits) ---

$matrixFixture = @(
    @{ Name = 'matrix/planning-doc-only'; Path = @('tools/blog-mcp/TODO-NEXT.md'); Expect = @('markdown_gate') }
    @{ Name = 'matrix/root-readme-only'; Path = @('README.md'); Expect = @('markdown_gate') }
    @{ Name = 'matrix/blog-post'; Path = @('docs/blog/2026-08-02-example-post.md'); Expect = @('markdown_gate', 'site_verify', 'site_deploy') }
    @{ Name = 'matrix/blog-tags'; Path = @('docs/blog/tags.yml'); Expect = @('site_verify', 'site_deploy') }
    @{ Name = 'matrix/blog-authors'; Path = @('docs/blog/authors.yml'); Expect = @('site_verify', 'site_deploy') }
    @{ Name = 'matrix/hub-page'; Path = @('docs/docs/index.md'); Expect = @('markdown_gate', 'site_verify', 'site_deploy') }
    @{ Name = 'matrix/server-src'; Path = @('tools/blog-mcp/src/tools/post.ts'); Expect = @('blog_mcp_test', 'blog_mcp_image') }
    @{ Name = 'matrix/server-src-plus-markdown'; Path = @('tools/blog-mcp/src/tools/post.ts', 'tools/blog-mcp/README.md'); Expect = @('markdown_gate', 'blog_mcp_test', 'blog_mcp_image') }
    @{ Name = 'matrix/server-readme-only'; Path = @('tools/blog-mcp/README.md'); Expect = @('markdown_gate') }
    @{ Name = 'matrix/mcp-next-only'; Path = @('tools/blog-mcp/MCP-NEXT.md'); Expect = @('markdown_gate') }
    @{ Name = 'matrix/test-only'; Path = @('tools/blog-mcp/test/post.test.ts'); Expect = @('blog_mcp_test') }
    @{ Name = 'matrix/ui-src'; Path = @('tools/blog-mcp/ui/src/views/Posts.tsx'); Expect = @('blog_mcp_test', 'blog_mcp_image') }
    @{ Name = 'matrix/ui-index-html'; Path = @('tools/blog-mcp/ui/index.html'); Expect = @('blog_mcp_test', 'blog_mcp_image') }
    @{ Name = 'matrix/ui-public-asset'; Path = @('tools/blog-mcp/ui/public/favicon.svg'); Expect = @('blog_mcp_test', 'blog_mcp_image') }
    @{ Name = 'matrix/ui-readme-only'; Path = @('tools/blog-mcp/ui/README.md'); Expect = @('markdown_gate') }
    @{ Name = 'matrix/dockerfile'; Path = @('tools/blog-mcp/Dockerfile'); Expect = @('blog_mcp_test', 'blog_mcp_image') }
    @{ Name = 'matrix/entrypoint'; Path = @('tools/blog-mcp/docker-entrypoint.sh'); Expect = @('blog_mcp_test', 'blog_mcp_image') }
    @{ Name = 'matrix/compose-root'; Path = @('docker-compose.yml'); Expect = @('blog_mcp_compose') }
    @{ Name = 'matrix/compose-local'; Path = @('tools/blog-mcp/docker-compose.yml'); Expect = @('blog_mcp_compose') }
    @{ Name = 'matrix/env-example'; Path = @('tools/blog-mcp/.env.example'); Expect = @('blog_mcp_compose') }
    @{ Name = 'matrix/artifact-script-only'; Path = @('build/Test-DocumentationArtifact.ps1'); Expect = @('site_verify') }
    @{
        Name   = 'matrix/mixed'
        Path   = @('docs/blog/2026-08-02-example-post.md', 'docs/docusaurus.config.ts', 'tools/blog-mcp/src/serve.ts', 'tools/blog-mcp/test/serve.test.ts')
        Expect = @('markdown_gate', 'site_verify', 'site_deploy', 'blog_mcp_test', 'blog_mcp_image')
    }
)

foreach ($fixture in $matrixFixture) {
    if (-not (Test-FixtureIncluded -Name $fixture.Name)) { continue }
    $result = Get-WorkflowChangeArea -ChangedPath $fixture.Path
    $findings.AddRange([pscustomobject[]] (Test-AreaExpectation -Fixture $fixture.Name -Result $result -ExpectedTrueArea $fixture.Expect))
}

# 'matrix/mixed' also gets exact MatchedPath assertions -- the diagnostics deliverable.
if (Test-FixtureIncluded -Name 'matrix/mixed') {
    $mixedResult = Get-WorkflowChangeArea -ChangedPath @('docs/blog/2026-08-02-example-post.md', 'docs/docusaurus.config.ts', 'tools/blog-mcp/src/serve.ts', 'tools/blog-mcp/test/serve.test.ts')
    $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture 'matrix/mixed' -Assertion 'MatchedPath:markdown_gate' `
                -Expected @('docs/blog/2026-08-02-example-post.md') -Actual $mixedResult.MatchedPath.markdown_gate))
    $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture 'matrix/mixed' -Assertion 'MatchedPath:site_verify' `
                -Expected @('docs/blog/2026-08-02-example-post.md', 'docs/docusaurus.config.ts') -Actual $mixedResult.MatchedPath.site_verify))
    $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture 'matrix/mixed' -Assertion 'MatchedPath:blog_mcp_test' `
                -Expected @('tools/blog-mcp/src/serve.ts', 'tools/blog-mcp/test/serve.test.ts') -Actual $mixedResult.MatchedPath.blog_mcp_test))
    $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture 'matrix/mixed' -Assertion 'MatchedPath:blog_mcp_image' `
                -Expected @('tools/blog-mcp/src/serve.ts') -Actual $mixedResult.MatchedPath.blog_mcp_image))
}

# --- Tier 1b: non-matrix path fixtures ---

$extraFixture = @(
    @{ Name = 'gate/documentation-rules'; Path = @('.config/DocumentationRules.psd1'); Expect = @('markdown_gate') }
    @{ Name = 'gate/documentation-script'; Path = @('build/Test-Documentation.ps1'); Expect = @('markdown_gate') }
    @{ Name = 'classifier/self-module'; Path = @('build/WorkflowChangeAreas.psm1'); Expect = @('markdown_gate', 'blog_mcp_test', 'workflow_definition') }
    @{ Name = 'classifier/test-script'; Path = @('build/Test-WorkflowChangeAreas.ps1'); Expect = @('markdown_gate', 'blog_mcp_test', 'workflow_definition') }
    @{ Name = 'classifier/wrapper-script'; Path = @('build/Get-WorkflowChangeArea.ps1'); Expect = @('markdown_gate', 'blog_mcp_test', 'workflow_definition') }
    @{ Name = 'workflow/image'; Path = @('.github/workflows/blog-mcp-image.yml'); Expect = @('blog_mcp_test', 'workflow_definition') }
    @{ Name = 'workflow/docs-ci'; Path = @('.github/workflows/docs-ci.yml'); Expect = @('site_verify', 'workflow_definition') }
    @{ Name = 'unknown/unclassified'; Path = @('LICENSE', '.editorconfig'); Expect = @() }
    @{ Name = 'glob/prefix-bleed'; Path = @('tools/blog-mcp-other/x.ts'); Expect = @() }
)

foreach ($fixture in $extraFixture) {
    if (-not (Test-FixtureIncluded -Name $fixture.Name)) { continue }
    $result = Get-WorkflowChangeArea -ChangedPath $fixture.Path
    $findings.AddRange([pscustomobject[]] (Test-AreaExpectation -Fixture $fixture.Name -Result $result -ExpectedTrueArea $fixture.Expect))
}

if (Test-FixtureIncluded -Name 'unknown/unclassified') {
    $unclassifiedResult = Get-WorkflowChangeArea -ChangedPath @('LICENSE', '.editorconfig')
    if ($unclassifiedResult.ChangedPathCount -ne 2) {
        $findings.Add((New-ChangeAreaFinding -Fixture 'unknown/unclassified' -Assertion 'ChangedPathCount' -Severity 'Error' `
                    -Expected '2' -Actual $unclassifiedResult.ChangedPathCount -Message 'Expected exactly 2 changed paths.'))
    }
    $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture 'unknown/unclassified' -Assertion 'UnmatchedPath' `
                -Expected @('LICENSE', '.editorconfig') -Actual $unclassifiedResult.UnmatchedPath))
}

# --- input normalization: backslashes, './' prefix, and duplicate paths collapse to the same set ---

if (Test-FixtureIncluded -Name 'input/normalization') {
    $normalizationResult = Get-WorkflowChangeArea -ChangedPath @('tools\blog-mcp\src\a.ts', './README.md', 'README.md', '')
    $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture 'input/normalization' -Assertion 'ChangedPath' `
                -Expected @('tools/blog-mcp/src/a.ts', 'README.md') -Actual $normalizationResult.ChangedPath))
    $findings.AddRange([pscustomobject[]] (Test-AreaExpectation -Fixture 'input/normalization' -Result $normalizationResult -ExpectedTrueArea @('markdown_gate', 'blog_mcp_test', 'blog_mcp_image')))
}

# --- scale: 350 fake paths, no truncation ---

if (Test-FixtureIncluded -Name 'scale/350-paths') {
    $scalePath = [System.Collections.Generic.List[string]]::new()
    for ($i = 0; $i -lt 320; $i++) {
        $scalePath.Add("tools/blog-mcp/src/generated/module-$('{0:D3}' -f $i).ts")
    }
    for ($i = 0; $i -lt 30; $i++) {
        $scalePath.Add("docs/blog/2026-08-02-post-$('{0:D2}' -f $i).md")
    }
    $scaleResult = Get-WorkflowChangeArea -ChangedPath $scalePath.ToArray()
    if ($scaleResult.ChangedPathCount -ne 350) {
        $findings.Add((New-ChangeAreaFinding -Fixture 'scale/350-paths' -Assertion 'ChangedPathCount' -Severity 'Error' `
                    -Expected '350' -Actual $scaleResult.ChangedPathCount -Message 'Expected exactly 350 changed paths -- the classifier must never truncate.'))
    }
    if ($scaleResult.MatchedPath.blog_mcp_image.Count -ne 320) {
        $findings.Add((New-ChangeAreaFinding -Fixture 'scale/350-paths' -Assertion 'blog_mcp_image count' -Severity 'Error' `
                    -Expected '320' -Actual $scaleResult.MatchedPath.blog_mcp_image.Count -Message 'Expected all 320 generated source paths matched.'))
    }
    if ($scaleResult.MatchedPath.site_deploy.Count -ne 30) {
        $findings.Add((New-ChangeAreaFinding -Fixture 'scale/350-paths' -Assertion 'site_deploy count' -Severity 'Error' `
                    -Expected '30' -Actual $scaleResult.MatchedPath.site_deploy.Count -Message 'Expected all 30 blog post paths matched.'))
    }
}

# --- empty input ---

if (Test-FixtureIncluded -Name 'empty/no-changes') {
    $emptyResult = Get-WorkflowChangeArea -ChangedPath @()
    $findings.AddRange([pscustomobject[]] (Test-AreaExpectation -Fixture 'empty/no-changes' -Result $emptyResult -ExpectedTrueArea @()))
    if ($emptyResult.ChangedPathCount -ne 0) {
        $findings.Add((New-ChangeAreaFinding -Fixture 'empty/no-changes' -Assertion 'ChangedPathCount' -Severity 'Error' `
                    -Expected '0' -Actual $emptyResult.ChangedPathCount -Message 'An empty change set must produce zero changed paths.'))
    }
}

# --- Tier 1c: glob translation ---

$globFixture = @(
    @{ Pattern = 'tools/blog-mcp/**'; Path = 'tools/blog-mcp/src/x.ts'; Expected = $true }
    @{ Pattern = 'tools/blog-mcp/**'; Path = 'tools/blog-mcp/README.md'; Expected = $true }
    @{ Pattern = 'tools/blog-mcp/**'; Path = 'tools/blog-mcp-other/x.ts'; Expected = $false }
    @{ Pattern = 'tools/blog-mcp/**'; Path = 'tools/blog-mcp'; Expected = $false }
    @{ Pattern = '**/*.md'; Path = 'README.md'; Expected = $true }
    @{ Pattern = '**/*.md'; Path = 'docs/docs/foo.md'; Expected = $true }
    @{ Pattern = '**/*.md'; Path = 'docs/blog/tags.yml'; Expected = $false }
    @{ Pattern = '**/*.md'; Path = 'notes.markdown'; Expected = $false }
    @{ Pattern = 'docs/**'; Path = 'docs/index.md'; Expected = $true }
    @{ Pattern = 'docs/**'; Path = 'docs/blog/post.md'; Expected = $true }
    @{ Pattern = 'docs/**'; Path = 'docsx/a.md'; Expected = $false }
    @{ Pattern = 'docs/**'; Path = 'mydocs/a.md'; Expected = $false }
    @{ Pattern = 'docs/**'; Path = 'Docs/index.md'; Expected = $false }
    @{ Pattern = '.config/DocumentationRules.psd1'; Path = '.config/DocumentationRules.psd1'; Expected = $true }
    @{ Pattern = '.config/DocumentationRules.psd1'; Path = '.config/DocumentationRules.psd1.bak'; Expected = $false }
    @{ Pattern = '.config/DocumentationRules.psd1'; Path = 'x/.config/DocumentationRules.psd1'; Expected = $false }
    @{ Pattern = 'tools/blog-mcp/ui/src/**'; Path = 'tools/blog-mcp/ui/src/views/Posts.tsx'; Expected = $true }
    @{ Pattern = 'tools/blog-mcp/ui/src/**'; Path = 'tools/blog-mcp/ui/public/favicon.svg'; Expected = $false }
    @{ Pattern = 'tools/blog-mcp/ui/tsconfig*.json'; Path = 'tools/blog-mcp/ui/tsconfig.app.json'; Expected = $true }
    @{ Pattern = 'tools/blog-mcp/ui/tsconfig*.json'; Path = 'tools/blog-mcp/ui/nested/tsconfig.app.json'; Expected = $false }
    @{ Pattern = '**/.env.example'; Path = '.env.example'; Expected = $true }
    @{ Pattern = '**/.env.example'; Path = 'tools/blog-mcp/.env.example'; Expected = $true }
    @{ Pattern = 'a/**/b'; Path = 'a/b'; Expected = $true }
    @{ Pattern = 'a/**/b'; Path = 'a/x/y/b'; Expected = $true }
)

if (Test-FixtureIncluded -Name 'glob/table') {
    foreach ($row in $globFixture) {
        $actual = Test-WorkflowPathPattern -Path $row.Path -Pattern @($row.Pattern)
        if ($actual -ne $row.Expected) {
            $findings.Add((New-ChangeAreaFinding -Fixture 'glob/table' -Assertion "'$($row.Pattern)' vs '$($row.Path)'" -Severity 'Error' `
                        -Expected $row.Expected -Actual $actual -Message "Pattern '$($row.Pattern)' against path '$($row.Path)' expected $($row.Expected) but got $actual."))
        }
    }
}

if (Test-FixtureIncluded -Name 'glob/malformed-embedded') {
    $findings.AddRange([pscustomobject[]] (Test-ThrowsFixture -Fixture 'glob/malformed-embedded' -ExpectedMessagePattern 'whole path segment' -ScriptBlock {
                ConvertTo-WorkflowPathRegex -Pattern 'foo**bar'
            }))
}
if (Test-FixtureIncluded -Name 'glob/malformed-leading-slash') {
    $findings.AddRange([pscustomobject[]] (Test-ThrowsFixture -Fixture 'glob/malformed-leading-slash' -ExpectedMessagePattern 'empty path segment' -ScriptBlock {
                ConvertTo-WorkflowPathRegex -Pattern '/docs/**'
            }))
}

# --- meta: coverage completeness ---

if (Test-FixtureIncluded -Name 'meta/area-coverage') {
    $definition = Get-WorkflowChangeAreaDefinition
    $expectedNames = @('markdown_gate', 'site_verify', 'site_deploy', 'blog_mcp_test', 'blog_mcp_image', 'blog_mcp_compose', 'workflow_definition')
    $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture 'meta/area-coverage' -Assertion 'DefinitionKeys' -Expected $expectedNames -Actual @($definition.Keys)))
}

# ---------------------------------------------------------------------------
# Tier 2: synthetic 'git diff --name-status -z' parser fixtures (no git)
# ---------------------------------------------------------------------------

if (Test-FixtureIncluded -Name 'parse/modify-add-delete') {
    $records = ConvertFrom-GitNameStatusRecord -NameStatusOutput "M`0a.md`0A`0b.md`0D`0c.md`0"
    if ($records.Count -ne 3 -or $records[0].Status -ne 'M' -or $records[1].Status -ne 'A' -or $records[2].Status -ne 'D') {
        $findings.Add((New-ChangeAreaFinding -Fixture 'parse/modify-add-delete' -Assertion 'Records' -Severity 'Error' -Message "Expected [M a.md, A b.md, D c.md], got: $($records | ConvertTo-Json -Compress)"))
    }
}

if (Test-FixtureIncluded -Name 'parse/rename') {
    $records = ConvertFrom-GitNameStatusRecord -NameStatusOutput "R095`0docs/docs/old.md`0docs/blog/new.md`0"
    if ($records.Count -ne 1 -or $records[0].Status -ne 'R' -or $records[0].Score -ne 95 -or $records[0].OldPath -ne 'docs/docs/old.md' -or $records[0].Path -ne 'docs/blog/new.md') {
        $findings.Add((New-ChangeAreaFinding -Fixture 'parse/rename' -Assertion 'Record' -Severity 'Error' -Message "Unexpected rename record: $($records | ConvertTo-Json -Compress)"))
    }
}

if (Test-FixtureIncluded -Name 'parse/copy') {
    $records = ConvertFrom-GitNameStatusRecord -NameStatusOutput "C100`0a.md`0b.md`0"
    if ($records.Count -ne 1 -or $records[0].Status -ne 'C' -or $records[0].OldPath -ne 'a.md' -or $records[0].Path -ne 'b.md') {
        $findings.Add((New-ChangeAreaFinding -Fixture 'parse/copy' -Assertion 'Record' -Severity 'Error' -Message "Unexpected copy record: $($records | ConvertTo-Json -Compress)"))
    }
}

if (Test-FixtureIncluded -Name 'parse/typechange') {
    $records = ConvertFrom-GitNameStatusRecord -NameStatusOutput "T`0link.ts`0"
    if ($records.Count -ne 1 -or $records[0].Status -ne 'T') {
        $findings.Add((New-ChangeAreaFinding -Fixture 'parse/typechange' -Assertion 'Record' -Severity 'Error' -Message "Unexpected typechange record: $($records | ConvertTo-Json -Compress)"))
    }
}

if (Test-FixtureIncluded -Name 'parse/no-trailing-nul') {
    $withTrailing = ConvertFrom-GitNameStatusRecord -NameStatusOutput "M`0a.md`0"
    $withoutTrailing = ConvertFrom-GitNameStatusRecord -NameStatusOutput "M`0a.md"
    if ($withTrailing.Count -ne $withoutTrailing.Count -or $withTrailing[0].Path -ne $withoutTrailing[0].Path) {
        $findings.Add((New-ChangeAreaFinding -Fixture 'parse/no-trailing-nul' -Assertion 'Equivalence' -Severity 'Error' -Message 'A missing trailing NUL must parse identically to one with it.'))
    }
}

if (Test-FixtureIncluded -Name 'parse/empty') {
    $records = ConvertFrom-GitNameStatusRecord -NameStatusOutput ''
    if ($records.Count -ne 0) {
        $findings.Add((New-ChangeAreaFinding -Fixture 'parse/empty' -Assertion 'Records' -Severity 'Error' -Expected '0' -Actual $records.Count -Message 'Empty diff output must parse to zero records, not an error.'))
    }
}

if (Test-FixtureIncluded -Name 'parse/path-with-space-and-unicode') {
    $records = ConvertFrom-GitNameStatusRecord -NameStatusOutput "M`0docs/blog/h`u{00e9}llo w`u{00f6}rld.md`0"
    if ($records.Count -ne 1 -or $records[0].Path -ne "docs/blog/h`u{00e9}llo w`u{00f6}rld.md") {
        $findings.Add((New-ChangeAreaFinding -Fixture 'parse/path-with-space-and-unicode' -Assertion 'Path' -Severity 'Error' -Message "Path with space and Unicode was mangled: $($records | ConvertTo-Json -Compress)"))
    }
}

if (Test-FixtureIncluded -Name 'parse/path-with-newline') {
    $records = ConvertFrom-GitNameStatusRecord -NameStatusOutput "M`0we`nird.md`0"
    if ($records.Count -ne 1 -or $records[0].Path -ne "we`nird.md") {
        $findings.Add((New-ChangeAreaFinding -Fixture 'parse/path-with-newline' -Assertion 'Path' -Severity 'Error' -Message 'A literal newline inside a path must not be treated as a field separator (NUL-only splitting).'))
    }
}

if (Test-FixtureIncluded -Name 'parse/truncated-rename') {
    $findings.AddRange([pscustomobject[]] (Test-ThrowsFixture -Fixture 'parse/truncated-rename' -ExpectedMessagePattern 'truncated' -ScriptBlock {
                ConvertFrom-GitNameStatusRecord -NameStatusOutput "M`0a.md`0R100`0only-one-path`0"
            }))
}

if (Test-FixtureIncluded -Name 'parse/unknown-status') {
    $findings.AddRange([pscustomobject[]] (Test-ThrowsFixture -Fixture 'parse/unknown-status' -ExpectedMessagePattern 'Unrecognized' -ScriptBlock {
                ConvertFrom-GitNameStatusRecord -NameStatusOutput "X`0a.md`0"
            }))
}

if (Test-FixtureIncluded -Name 'parse/unmerged') {
    $findings.AddRange([pscustomobject[]] (Test-ThrowsFixture -Fixture 'parse/unmerged' -ExpectedMessagePattern 'Unrecognized' -ScriptBlock {
                ConvertFrom-GitNameStatusRecord -NameStatusOutput "U`0a.md`0"
            }))
}

# ---------------------------------------------------------------------------
# Tier 3: real scratch git repositories
# ---------------------------------------------------------------------------

if ($SkipGitFixture) {
    $findings.Add((New-ChangeAreaFinding -Fixture 'git/*' -Assertion 'Skipped' -Severity 'Warning' -Message '-SkipGitFixture was passed; the real-git fixture tier did not run.'))
}
else {
    $originalGitConfigGlobal = $env:GIT_CONFIG_GLOBAL
    $originalGitConfigSystem = $env:GIT_CONFIG_SYSTEM
    $configSentinelDirectory = Join-Path ([IO.Path]::GetTempPath()) ('workflow-change-areas-config-' + [guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $configSentinelDirectory -Force | Out-Null
    try {
        # Point at nonexistent files so a developer's own ~/.gitconfig
        # (which could set diff.renames, core.autocrlf, etc.) cannot change
        # results here vs. a clean Actions runner.
        $env:GIT_CONFIG_GLOBAL = Join-Path $configSentinelDirectory 'no-global-config'
        $env:GIT_CONFIG_SYSTEM = Join-Path $configSentinelDirectory 'no-system-config'

        if (Test-FixtureIncluded -Name 'git/rename-and-delete') {
            $scratch = New-ChangeAreaScratchRepository
            try {
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'seed' -WriteFile @{
                    'docs/docs/old-post.md'      = "# old post`n"
                    'tools/blog-mcp/src/gone.ts' = "export const gone = true;`n"
                } | Out-Null
                # git mv does not create the destination directory itself.
                New-Item -ItemType Directory -Path (Join-Path $scratch 'docs' 'blog') -Force | Out-Null
                Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('mv', 'docs/docs/old-post.md', 'docs/blog/2026-08-02-old-post.md') | Out-Null
                Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('rm', 'tools/blog-mcp/src/gone.ts') | Out-Null
                Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('commit', '-m', 'rename and remove') | Out-Null

                $changePath = Get-WorkflowChangePath -RepositoryRoot $scratch -Base 'HEAD~1' -Head 'HEAD'
                $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture 'git/rename-and-delete' -Assertion 'ChangedPath' `
                            -Expected @('docs/docs/old-post.md', 'docs/blog/2026-08-02-old-post.md', 'tools/blog-mcp/src/gone.ts') -Actual $changePath.Path))

                $area = Get-WorkflowChangeArea -ChangedPath $changePath.Path -Base 'HEAD~1' -Head 'HEAD' -MergeBase $changePath.MergeBase
                $findings.AddRange([pscustomobject[]] (Test-AreaExpectation -Fixture 'git/rename-and-delete' -Result $area `
                            -ExpectedTrueArea @('markdown_gate', 'site_verify', 'site_deploy', 'blog_mcp_test', 'blog_mcp_image')))
            }
            finally {
                Remove-ChangeAreaScratchRepository -RepositoryRoot $scratch
            }
        }

        if (Test-FixtureIncluded -Name 'git/merge-base') {
            $scratch = New-ChangeAreaScratchRepository
            try {
                $seedSha = Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'seed' -WriteFile @{ 'README.md' = "# seed`n" }
                Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('checkout', '-b', 'feature') | Out-Null
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'feature work' -WriteFile @{ 'tools/blog-mcp/src/feature.ts' = "export const x = 1;`n" } | Out-Null
                Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('checkout', 'main') | Out-Null
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'main-only post' -WriteFile @{ 'docs/blog/2026-08-02-main-only-post.md' = "# main only`n" } | Out-Null

                $forward = Get-WorkflowChangePath -RepositoryRoot $scratch -Base 'main' -Head 'feature'
                $forwardArea = Get-WorkflowChangeArea -ChangedPath $forward.Path -Base 'main' -Head 'feature' -MergeBase $forward.MergeBase
                $findings.AddRange([pscustomobject[]] (Test-AreaExpectation -Fixture 'git/merge-base-divergence' -Result $forwardArea -ExpectedTrueArea @('blog_mcp_test', 'blog_mcp_image')))
                if ($forward.MergeBase.Count -ne 1 -or $forward.MergeBase[0] -ne $seedSha) {
                    $findings.Add((New-ChangeAreaFinding -Fixture 'git/merge-base-divergence' -Assertion 'MergeBase' -Severity 'Error' `
                                -Expected $seedSha -Actual ($forward.MergeBase -join ',') -Message 'Merge base did not resolve to the pre-divergence commit -- a naive two-dot diff would have let the main-only post leak into this comparison.'))
                }

                $reverse = Get-WorkflowChangePath -RepositoryRoot $scratch -Base 'feature' -Head 'main'
                $reverseArea = Get-WorkflowChangeArea -ChangedPath $reverse.Path -Base 'feature' -Head 'main' -MergeBase $reverse.MergeBase
                $findings.AddRange([pscustomobject[]] (Test-AreaExpectation -Fixture 'git/merge-base-reversed' -Result $reverseArea -ExpectedTrueArea @('markdown_gate', 'site_verify', 'site_deploy')))
                if ($reverse.MergeBase.Count -ne 1 -or $reverse.MergeBase[0] -ne $seedSha) {
                    $findings.Add((New-ChangeAreaFinding -Fixture 'git/merge-base-reversed' -Assertion 'MergeBase' -Severity 'Error' -Message 'Merge base must be symmetric regardless of comparison direction.'))
                }
            }
            finally {
                Remove-ChangeAreaScratchRepository -RepositoryRoot $scratch
            }
        }

        if (Test-FixtureIncluded -Name 'git/renames-config-independent') {
            $scratch = New-ChangeAreaScratchRepository
            try {
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'seed' -WriteFile @{ 'docs/docs/old-post.md' = "# old post`n" } | Out-Null
                # git mv does not create the destination directory itself.
                New-Item -ItemType Directory -Path (Join-Path $scratch 'docs' 'blog') -Force | Out-Null
                Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('mv', 'docs/docs/old-post.md', 'docs/blog/2026-08-02-old-post.md') | Out-Null
                Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('commit', '-m', 'rename') | Out-Null

                $baselinePath = (Get-WorkflowChangePath -RepositoryRoot $scratch -Base 'HEAD~1' -Head 'HEAD').Path
                foreach ($renameConfig in @('false', 'copies', 'true')) {
                    Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('config', 'diff.renames', $renameConfig) | Out-Null
                    $configuredPath = (Get-WorkflowChangePath -RepositoryRoot $scratch -Base 'HEAD~1' -Head 'HEAD').Path
                    $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture "git/renames-config-independent[diff.renames=$renameConfig]" -Assertion 'ChangedPath' -Expected $baselinePath -Actual $configuredPath))
                }
            }
            finally {
                Remove-ChangeAreaScratchRepository -RepositoryRoot $scratch
            }
        }

        if (Test-FixtureIncluded -Name 'git/more-than-300-files') {
            $scratch = New-ChangeAreaScratchRepository
            try {
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'seed' -WriteFile @{ 'README.md' = "# seed`n" } | Out-Null

                $bulkFile = @{}
                for ($i = 0; $i -lt 320; $i++) {
                    $bulkFile["tools/blog-mcp/src/generated/deeply/nested/for/output/size/module-$('{0:D3}' -f $i).ts"] = "export const value = $i;`n"
                }
                for ($i = 0; $i -lt 30; $i++) {
                    $bulkFile["docs/blog/2026-08-02-post-$('{0:D2}' -f $i).md"] = "# post $i`n"
                }
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'bulk add' -WriteFile $bulkFile | Out-Null

                $changePath = Get-WorkflowChangePath -RepositoryRoot $scratch -Base 'HEAD~1' -Head 'HEAD'
                if ($changePath.Path.Count -ne 350) {
                    $findings.Add((New-ChangeAreaFinding -Fixture 'git/more-than-300-files' -Assertion 'ChangedPathCount' -Severity 'Error' `
                                -Expected '350' -Actual $changePath.Path.Count -Message 'A real >300-file diff must not be truncated.'))
                }

                $area = Get-WorkflowChangeArea -ChangedPath $changePath.Path -Base 'HEAD~1' -Head 'HEAD' -MergeBase $changePath.MergeBase
                if ($area.MatchedPath.blog_mcp_image.Count -ne 320) {
                    $findings.Add((New-ChangeAreaFinding -Fixture 'git/more-than-300-files' -Assertion 'blog_mcp_image count' -Severity 'Error' `
                                -Expected '320' -Actual $area.MatchedPath.blog_mcp_image.Count -Message 'Expected all 320 generated source files matched.'))
                }
                if ($area.MatchedPath.site_deploy.Count -ne 30) {
                    $findings.Add((New-ChangeAreaFinding -Fixture 'git/more-than-300-files' -Assertion 'site_deploy count' -Severity 'Error' `
                                -Expected '30' -Actual $area.MatchedPath.site_deploy.Count -Message 'Expected all 30 blog posts matched.'))
                }
            }
            finally {
                Remove-ChangeAreaScratchRepository -RepositoryRoot $scratch
            }
        }

        if (Test-FixtureIncluded -Name 'git/identical-base-and-head') {
            $scratch = New-ChangeAreaScratchRepository
            try {
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'seed' -WriteFile @{ 'README.md' = "# seed`n" } | Out-Null
                $changePath = Get-WorkflowChangePath -RepositoryRoot $scratch -Base 'HEAD' -Head 'HEAD'
                if ($changePath.Path.Count -ne 0) {
                    $findings.Add((New-ChangeAreaFinding -Fixture 'git/identical-base-and-head' -Assertion 'ChangedPathCount' -Severity 'Error' `
                                -Expected '0' -Actual $changePath.Path.Count -Message 'Identical base and head must produce zero changed paths.'))
                }
                $area = Get-WorkflowChangeArea -ChangedPath $changePath.Path -Base 'HEAD' -Head 'HEAD' -MergeBase $changePath.MergeBase
                $findings.AddRange([pscustomobject[]] (Test-AreaExpectation -Fixture 'git/identical-base-and-head' -Result $area -ExpectedTrueArea @()))
            }
            finally {
                Remove-ChangeAreaScratchRepository -RepositoryRoot $scratch
            }
        }

        if (Test-FixtureIncluded -Name 'git/unknown-ref') {
            $scratch = New-ChangeAreaScratchRepository
            try {
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'seed' -WriteFile @{ 'README.md' = "# seed`n" } | Out-Null
                $findings.AddRange([pscustomobject[]] (Test-ThrowsFixture -Fixture 'git/unknown-ref' -ExpectedMessagePattern 'does-not-exist' -ScriptBlock {
                            Get-WorkflowChangePath -RepositoryRoot $scratch -Base 'refs/heads/does-not-exist' -Head 'HEAD'
                        }))
            }
            finally {
                Remove-ChangeAreaScratchRepository -RepositoryRoot $scratch
            }
        }

        if (Test-FixtureIncluded -Name 'git/unrelated-histories') {
            $scratch = New-ChangeAreaScratchRepository
            try {
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'seed' -WriteFile @{ 'README.md' = "# seed`n" } | Out-Null
                Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('checkout', '--orphan', 'other') | Out-Null
                Invoke-GitCommand -RepositoryRoot $scratch -ArgumentList @('rm', '-rf', '--cached', '.') | Out-Null
                Add-ChangeAreaScratchCommit -RepositoryRoot $scratch -Message 'unrelated' -WriteFile @{ 'unrelated.md' = "# unrelated`n" } | Out-Null

                $findings.AddRange([pscustomobject[]] (Test-ThrowsFixture -Fixture 'git/unrelated-histories' -ExpectedMessagePattern 'merge base|shallow' -ScriptBlock {
                            Get-WorkflowChangePath -RepositoryRoot $scratch -Base 'main' -Head 'other'
                        }))
            }
            finally {
                Remove-ChangeAreaScratchRepository -RepositoryRoot $scratch
            }
        }

        if (Test-FixtureIncluded -Name 'git/wrapper-json-roundtrip') {
            # The wrapper always self-locates its repository root by walking
            # up from its own script location (matching how it will
            # actually run in CI), so it cannot be pointed at a scratch
            # repository without giving the production wrapper a
            # test-only parameter it has no real use for. Use a fixed,
            # immutable commit pair from this repository's own history
            # instead -- f1f5613 (the old-blog-to-blog-post migration,
            # which renamed files out of docs/docs/** into docs/blog/**)
            # against its parent, already hand-verified to classify as
            # markdown_gate + site_verify + site_deploy only, 25 paths,
            # 0 unmatched.
            $wrapperPath = Join-Path $repositoryRoot 'build' 'Get-WorkflowChangeArea.ps1'
            $jsonOutput = & pwsh -NoProfile -File $wrapperPath -Base 'f1f5613~1' -Head 'f1f5613' -Quiet 2>$null

            try {
                $parsed = $jsonOutput | ConvertFrom-Json
            }
            catch {
                $parsed = $null
                $findings.Add((New-ChangeAreaFinding -Fixture 'git/wrapper-json-roundtrip' -Assertion 'ValidJson' -Severity 'Error' -Message "Wrapper stdout did not parse as JSON: $($_.Exception.Message)"))
            }

            if ($parsed) {
                $definitionKeys = @((Get-WorkflowChangeAreaDefinition).Keys)
                $parsedAreaKeys = @($parsed.Area.PSObject.Properties.Name)
                $findings.AddRange([pscustomobject[]] (Test-StringSetEqual -Fixture 'git/wrapper-json-roundtrip' -Assertion 'AreaKeys' -Expected $definitionKeys -Actual $parsedAreaKeys))
                if ($parsed.Area.site_deploy -ne $true) {
                    $findings.Add((New-ChangeAreaFinding -Fixture 'git/wrapper-json-roundtrip' -Assertion 'site_deploy' -Severity 'Error' -Message 'Expected site_deploy true through the JSON round trip via the wrapper script.'))
                }
                if ($null -eq $parsed.MatchedPath.blog_mcp_compose -or @($parsed.MatchedPath.blog_mcp_compose).Count -ne 0) {
                    $findings.Add((New-ChangeAreaFinding -Fixture 'git/wrapper-json-roundtrip' -Assertion 'EmptyArraySerialization' -Severity 'Error' -Message 'An inactive area must serialize as an empty JSON array, not null or a non-empty value.'))
                }
            }
        }
    }
    finally {
        $env:GIT_CONFIG_GLOBAL = $originalGitConfigGlobal
        $env:GIT_CONFIG_SYSTEM = $originalGitConfigSystem
        if (-not $KeepScratch) {
            Remove-Item -LiteralPath $configSentinelDirectory -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# --- meta: every defined area was actually seen true by at least one fixture above ---

if (Test-FixtureIncluded -Name 'meta/area-coverage') {
    $definition = Get-WorkflowChangeAreaDefinition
    foreach ($areaName in $definition.Keys) {
        if (-not $script:AreaSeenTrue.Contains($areaName)) {
            $findings.Add((New-ChangeAreaFinding -Fixture 'meta/area-coverage' -Assertion "SeenTrue:$areaName" -Severity 'Error' `
                        -Message "Area '$areaName' was never true in any fixture in this run -- add one, or a new area can be defined with zero real coverage."))
        }
    }
}

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

if ($findings.Count -gt 0) {
    foreach ($finding in $findings | Sort-Object Fixture, Assertion) {
        Write-Host "$($finding.Fixture) [$($finding.Assertion)] [$($finding.Severity)]: $($finding.Message)"
    }
}

$warningFinding = @($findings | Where-Object Severity -eq 'Warning')
$blockingFinding = @($findings | Where-Object Severity -ne 'Warning')

if ($blockingFinding.Count -gt 0) {
    throw "Workflow change-area classifier checks failed with $($blockingFinding.Count) error(s), $($warningFinding.Count) warning(s)."
}

if ($warningFinding.Count -gt 0) {
    Write-Host "Workflow change-area classifier checks passed, with $($warningFinding.Count) warning(s)." -ForegroundColor Yellow
}
else {
    Write-Host 'Workflow change-area classifier checks passed.' -ForegroundColor Green
}
