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
    [string] $TagDefinitionPath = 'docs/blog/tags.yml',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $TemplatePath = 'docs/blog/_post-template.md'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$output = [IO.Path]::GetFullPath($OutputPath)
$tagDefinitions = [IO.Path]::GetFullPath($TagDefinitionPath)
$template = [IO.Path]::GetFullPath($TemplatePath)

if (-not (Test-Path -LiteralPath $output -PathType Container)) {
    throw "Documentation artifact directory not found: '$output'."
}

if (-not (Test-Path -LiteralPath $tagDefinitions -PathType Leaf)) {
    throw "Blog tag definitions not found: '$tagDefinitions'."
}

if (-not (Test-Path -LiteralPath $template -PathType Leaf)) {
    throw "Blog post template not found: '$template'."
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

function Get-ArtifactContent {
    param (
        [Parameter(Mandatory)]
        [string] $RelativePath
    )

    $fullPath = Join-Path $output $RelativePath
    return Get-Content -LiteralPath $fullPath -Raw
}

function Assert-Content {
    param (
        [Parameter(Mandatory)]
        [string] $Content,

        [Parameter(Mandatory)]
        [string[]] $ExpectedText,

        [Parameter(Mandatory)]
        [string] $Label
    )

    foreach ($text in $ExpectedText) {
        if (-not $Content.Contains($text)) {
            throw "Expected $Label to contain '$text'."
        }
    }
}

function Assert-ArtifactContent {
    param (
        [Parameter(Mandatory)]
        [string] $RelativePath,

        [Parameter(Mandatory)]
        [string[]] $ExpectedText
    )

    $content = Get-ArtifactContent -RelativePath $RelativePath
    Assert-Content -Content $content -ExpectedText $ExpectedText -Label "documentation artifact '$RelativePath'"
}

# Line-based extraction with optional trailing YAML comments. A tag entry
# this cannot read fails the key/permalink count check below rather than
# being skipped silently.
$tagLines = @(Get-Content -LiteralPath $tagDefinitions)
$tagKeys = @(
    foreach ($line in $tagLines) {
        if ($line -cmatch '^([a-z0-9][a-z0-9-]*):\s*(?:#.*)?$') {
            $Matches[1]
        }
    }
)
$tagPermalinks = @(
    foreach ($line in $tagLines) {
        if ($line -cmatch '^\s+permalink:\s+[''"]?/?([a-z0-9][a-z0-9-]*)[''"]?\s*(?:#.*)?$') {
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
    'series/lucifer-chronicles/index.html'
    'series/ai-assisted-engineering/index.html'
    'series/building-the-blog/index.html'
    'series/docker/index.html'
    'series/state-of-dev/index.html'
    'projects/game-engine/index.html'
    'about/index.html'
)

foreach ($route in $requiredRoutes) {
    Assert-ArtifactFile -RelativePath $route
}

# The custom Navbar is server-rendered into every route. Assert its canonical
# identity and the two navigation groups on representative blog, hub and docs
# pages so a Docusaurus theme upgrade cannot silently restore the default bar.
$mastheadRequiredText = @(
    'class="site-masthead"',
    'class="site-masthead__frame"',
    'class="site-masthead__stack"',
    'class="site-masthead__rule"',
    '>SubZeroDev</a>',
    'Professional uncertainty since 2026.',
    'Well… Why not?',
    'https://subzerodev.com/',
    '>SubZeroDev.com<',
    'https://blog.subzerodev.com/',
    'https://github.com/The-Running-Dev?tab=repositories',
    'https://portfolio.subzerodev.com/',
    '>Latest</a>',
    '>Archive</a>',
    '>Topics</a>',
    '>Series</a>',
    '>Builds</a>',
    '>About</a>',
    '>Docs</a>'
)

$representativeRoutes = @('index.html', 'lucifer-discovers-recursive-bureaucracy/index.html', 'about/index.html', 'docs/index.html')

# The footer bar mirrors the masthead's outbound group on the same
# representative routes, so a Docusaurus theme upgrade or a reverted config
# edit cannot silently collapse it back to its previous empty state. Checked
# against the <footer> element's own markup, not the whole page -- the four
# links are also required page-wide by $mastheadRequiredText, so a page-wide
# check here couldn't tell a correctly-populated footer from an empty one.
$footerLinkText = @(
    'https://subzerodev.com/',
    '>SubZeroDev.com<',
    'https://blog.subzerodev.com/',
    'https://github.com/The-Running-Dev?tab=repositories',
    'https://portfolio.subzerodev.com/'
)

foreach ($route in $representativeRoutes) {
    $content = Get-ArtifactContent -RelativePath $route
    Assert-Content -Content $content -ExpectedText $mastheadRequiredText -Label "documentation artifact '$route'"

    # Blog list pages also render a per-article <footer> (post tags), which a
    # bare <footer>...</footer> match would find first. `theme-layout-footer`
    # is the class @docusaurus/theme-classic puts only on the site-wide
    # footer landmark, so anchor on that instead.
    if ($content -notmatch '(?s)<footer\b[^>]*\btheme-layout-footer\b[^>]*>(.*?)</footer>') {
        throw "Expected documentation artifact '$route' to contain the site footer (class ``theme-layout-footer``)."
    }
    Assert-Content -Content $Matches[1] -ExpectedText $footerLinkText -Label "documentation artifact '$route' footer"
}

foreach ($permalink in $tagPermalinks) {
    Assert-ArtifactFile -RelativePath "tags/$permalink/index.html"
}

# A leaked template would be routed by its front matter slug, not its
# filename, so derive the route to assert absent from the template itself.
$templateSlugLine = @(Get-Content -LiteralPath $template) -cmatch '^slug:\s*\S'
if ($templateSlugLine.Count -ne 1) {
    throw "Expected exactly one slug in '$TemplatePath'."
}

$templateSlug = ($templateSlugLine[0] -replace '^slug:\s*', '').Trim().Trim('''"').TrimStart('/')
foreach ($leakedRoute in @("$templateSlug/index.html", '_post-template/index.html')) {
    $unexpectedTemplateRoute = Join-Path $output $leakedRoute
    if (Test-Path -LiteralPath $unexpectedTemplateRoute) {
        throw "The authoring template was emitted as a public blog route: '$leakedRoute'."
    }
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
