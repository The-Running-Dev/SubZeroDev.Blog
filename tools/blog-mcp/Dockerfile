# syntax=docker/dockerfile:1
#
# Ships the MCP server that exposes this repository's deterministic
# publishing steps as callable tools. Deliberately carries NO Docker and
# does not run the production Docusaurus build -- that stays with the
# `Verify Documentation Build` CI check. The repository itself is never
# baked into this image: on every start, the entrypoint clones (or
# reconciles an existing clone of) BLOG_MCP_CLONE_URL into a volume at
# BLOG_MCP_WORKSPACE, so the container is fully self-contained -- no host
# checkout or bind mount required. See tools/blog-mcp/README.md.

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- build: compile TypeScript ---------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- deps: production-only node_modules ------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime -----------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime

# git: version control. gh: GitHub CLI (Tier C remote tools, Tier D
# monitoring). pwsh: runs build/Test-Documentation.ps1 and
# build/Test-DocumentationArtifact.ps1 unmodified, so this container can
# never drift from what CI actually runs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg git less \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/microsoft-debian-bookworm-prod bookworm main" > /etc/apt/sources.list.d/microsoft.list \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends powershell gh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Reuse the base image's existing non-root `node` user (uid 1000) rather
# than adding a new one. The workspace volume is where the clone lives
# across restarts; owned by `node` up front since a fresh named volume
# mounts as root:root.
RUN mkdir -p /workspace && chown node:node /workspace

USER node
ENV HOME=/home/node
ENV BLOG_MCP_WORKSPACE=/workspace

# Documentation only -- EXPOSE does not publish the port by itself. Both
# http and serve modes bind 127.0.0.1 by default, which `-p` cannot forward
# into; pass `-e BLOG_MCP_HTTP_HOST=0.0.0.0` explicitly when running either
# with a published port.
EXPOSE 8765

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["stdio"]
