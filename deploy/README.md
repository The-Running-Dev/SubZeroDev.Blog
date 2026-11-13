# Blog-bot deployment (OpenTofu)

Manages the production blog-bot stack on the VPS through `modules/app` of SubZeroDev.Infra: the Portainer
Git stack (stack 11, project `blog-bot`), the Cloudflare tunnel route and DNS record for
`blogging.subzerodev.com`, and the GitHub `production` environment (`INFRA_DISPATCH_TOKEN`).

Run everything through `./deploy/tofu.ps1`; it loads credentials from your User-scope environment and the
stack's values from a private var-file outside the repository.

## First adoption

1. Merge the change that adds `compose.tunnel.yaml` and drops the published port first. The stack is
   recreated (its volume is kept) and the overlay must already be on `main` or the create fails.
2. In the SubZeroDev.Infra repository, write the var-file from the running stack (prints names only):

   ```powershell
   ./scripts/export-stack-env.ps1 -StackId 11 `
     -SecretNames BLOG_MCP_CLONE_URL,BLOG_MCP_HTTP_TOKEN,BLOG_MCP_UI_PASSWORD_HASH,GH_TOKEN `
     -Skip BLOG_MCP_IMAGE `
     -Out "$HOME\.subzerodev\blog-bot.tfvars.json"
   ```

3. `./deploy/tofu.ps1 plan -var initial_image=ghcr.io/the-running-dev/subzerodev-blog-mcp@sha256:<digest>`
   using the digest of the image built from `main`; then `apply`.
4. Check `https://blogging.subzerodev.com/healthz`, and that a second `plan` shows no changes.
5. Delete the old Nginx Proxy Manager host.

## Deploys

A push to `main` that changes the image inputs builds the image, then the `deploy` job in
`blog-mcp-image.yml` starts the Infra deploy workflow with its digest. Infra validates it, redeploys the
stack and waits until `/healthz` reports that commit; the post-deploy script then verifies the MCP catalog.
