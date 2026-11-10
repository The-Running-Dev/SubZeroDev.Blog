<#
.SYNOPSIS
Post-deploy hook for the shared container workflow: verifies the deployed
blog-mcp build and MCP catalog.

.DESCRIPTION
Run by container.yml's Deploy job (actions/run-scripts) after the redeploy
webhook has returned and the public /healthz reports the new revision. Adapts
that hook's environment to build/Confirm-BlogMcpDeployment.ps1, which keeps
the original issue #109 behavior: poll /healthz until it reports the expected
revision for several consecutive samples, then check the /mcp tool catalog.

  DEPLOY_TOKEN   the BLOG_MCP_DEPLOY_VERIFY_TOKEN secret, mapped by the caller
                 (Confirm-BlogMcpDeployment.ps1 reads it from the
                 BLOG_MCP_DEPLOY_VERIFY_TOKEN environment variable)
  GITHUB_SHA     the commit that was built and deployed

Fails closed if the token is not configured.
#>
[CmdletBinding()]
param ()

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:DEPLOY_TOKEN)) {
    throw 'DEPLOY_TOKEN is empty: the BLOG_MCP_DEPLOY_VERIFY_TOKEN secret is not configured, so the deployed build cannot be verified.'
}
if ([string]::IsNullOrWhiteSpace($env:GITHUB_SHA)) {
    throw 'GITHUB_SHA is empty: the expected revision is unknown.'
}

$env:BLOG_MCP_DEPLOY_VERIFY_TOKEN = $env:DEPLOY_TOKEN

& (Join-Path $PSScriptRoot 'Confirm-BlogMcpDeployment.ps1') `
    -BaseUri 'https://blogging.subzerodev.com' `
    -ExpectedRevision $env:GITHUB_SHA
