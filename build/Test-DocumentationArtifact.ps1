<#
.SYNOPSIS
Validates discovery routes and feeds in a production documentation artifact.

.DESCRIPTION
Checks the route contract that only exists after a production Docusaurus build:
canonical and compatibility pages, the archive, the tag index and every
predefined tag page, and the RSS and Atom feeds. It also proves that the
authoring template was excluded from blog discovery.
#>
[CmdletBinding()]
param (
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $OutputPath = 'artifacts/docs',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $TagDefinitionPath = 'docs/blog/tags.yml'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$output = [IO.Path]::GetFullPath($OutputPath)
$tagDefinitions = [IO.Path]::GetFullPath($TagDefinitionPath)

if (-not (Test-Path -LiteralPath $output -PathType Container)) {
    throw "Documentation artifact directory not found: '$output'."
}

if (-not (Test-Path -LiteralPath $tagDefinitions -PathType Leaf)) {
    throw "Blog tag definitions not found: '$tagDefinitions'."
}

function Assert-ArtifactFile {
    param (
        [Parameter(Mandatory)]
        [string] $RelativePath
    )

    $fullPath = Join-Path $output $RelativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Expected documentation artifact file was not generated: '$RelativePath'."
    }
}

$tagLines = @(Get-Content -LiteralPath $tagDefinitions)
$tagKeys = @(
    foreach ($line in $tagLines) {
        if ($line -cmatch '^([a-z0-9][a-z0-9-]*):\s*$') {
            $Matches[1]
        }
    }
)
$tagPermalinks = @(
    foreach ($line in $tagLines) {
        if ($line -cmatch '^\s+permalink:\s+[''"]?/?([a-z0-9][a-z0-9-]*)[''"]?\s*$') {
            $Matches[1]
        }
    }
)

if ($tagKeys.Count -eq 0) {
    throw "No tag keys were found in '$TagDefinitionPath'."
}

if ($tagKeys.Count -ne $tagPermalinks.Count) {
    throw "Every tag in '$TagDefinitionPath' must declare one simple permalink."
}

$duplicateKeys = @($tagKeys | Group-Object | Where-Object Count -gt 1)
if ($duplicateKeys.Count -gt 0) {
    throw "Duplicate blog tag key: '$($duplicateKeys[0].Name)'."
}

$duplicatePermalinks = @($tagPermalinks | Group-Object | Where-Object Count -gt 1)
if ($duplicatePermalinks.Count -gt 0) {
    throw "Duplicate blog tag permalink: '$($duplicatePermalinks[0].Name)'."
}

$requiredRoutes = @(
    'index.html'
    'welcome/index.html'
    'ai-assisted-engineering-workflow/index.html'
    'docs/index.html'
    'blog/index.html'
    'blog/welcome/index.html'
    'archive/index.html'
    'tags/index.html'
)

foreach ($route in $requiredRoutes) {
    Assert-ArtifactFile -RelativePath $route
}

foreach ($permalink in $tagPermalinks) {
    Assert-ArtifactFile -RelativePath "tags/$permalink/index.html"
}

$unexpectedTemplateRoute = Join-Path $output '_post-template/index.html'
if (Test-Path -LiteralPath $unexpectedTemplateRoute) {
    throw "The authoring template was emitted as a public blog route."
}

foreach ($feedPath in @('rss.xml', 'atom.xml')) {
    Assert-ArtifactFile -RelativePath $feedPath
    $feedFile = Join-Path $output $feedPath

    try {
        [xml] $feed = Get-Content -LiteralPath $feedFile -Raw
    }
    catch {
        throw "Feed '$feedPath' is not valid XML: $($_.Exception.Message)"
    }

    $feedText = $feed.OuterXml
    if (-not $feedText.Contains('https://blog.subzerodev.com/')) {
        throw "Feed '$feedPath' does not contain the canonical site URL."
    }
    if (-not $feedText.Contains('/ai-assisted-engineering-workflow')) {
        throw "Feed '$feedPath' does not contain the current workflow post."
    }
}

Write-Host (
    "Documentation artifact checks passed: $($requiredRoutes.Count) core routes, " +
    "$($tagPermalinks.Count) tag routes, and 2 feeds."
) -ForegroundColor Green
