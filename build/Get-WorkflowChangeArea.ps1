<#
.SYNOPSIS
Classifies the Git changes between two refs into named change areas.

.DESCRIPTION
Thin CLI wrapper around build/WorkflowChangeAreas.psm1's
Get-WorkflowChangePath and Get-WorkflowChangeArea. Prints a human-readable
diagnostic summary to the host and, always, the result object as JSON to
stdout -- suitable for a future CI step to capture and turn into per-area
outputs. Fails closed: any classification error throws and this script
exits non-zero rather than silently classifying nothing.

Does not touch any workflow YAML itself; nothing consumes this script's
output yet.

.PARAMETER Base
The base ref to compare from. Defaults to 'origin/main'.

.PARAMETER Head
The head ref to compare to. Defaults to 'HEAD'.

.PARAMETER JsonPath
Optional file path to also write the JSON result to.

.PARAMETER Quiet
Suppress the human-readable summary; JSON only.
#>
[CmdletBinding()]
param (
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $Base = 'origin/main',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $Head = 'HEAD',

    [Parameter()]
    [string] $JsonPath,

    [Parameter()]
    [switch] $Quiet
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

function Find-ChangeAreaRepositoryRoot {
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
        $repositoryRoot = Find-ChangeAreaRepositoryRoot -StartPath $start
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

$changePath = Get-WorkflowChangePath -RepositoryRoot $repositoryRoot -Base $Base -Head $Head
$result = Get-WorkflowChangeArea `
    -ChangedPath $changePath.Path `
    -Base $Base `
    -Head $Head `
    -BaseCommit $changePath.BaseCommit `
    -HeadCommit $changePath.HeadCommit `
    -MergeBase $changePath.MergeBase

if (-not $Quiet) {
    Write-Host (Format-WorkflowChangeAreaSummary -Result $result)
}

$json = $result | ConvertTo-Json -Depth 6

if ($JsonPath) {
    Set-Content -LiteralPath $JsonPath -Value $json -Encoding utf8
}

Write-Output $json
