#!/bin/sh
# Selects transport (argv[1] > BLOG_MCP_TRANSPORT > stdio) and prepares the
# bind-mounted repo for git before handing off to the server. POSIX sh, not
# bash -- keeps the runtime image minimal.
set -eu

REPO="${BLOG_MCP_REPO:-/repo}"

if [ -d "$REPO/.git" ] || [ -f "$REPO/.git" ]; then
  # A bind-mounted repo is very often owned by a different uid than the
  # container's `node` user; without this, git refuses every command in it
  # with "detected dubious ownership".
  git config --global --add safe.directory "$REPO"
fi

MODE="${1:-${BLOG_MCP_TRANSPORT:-stdio}}"

case "$MODE" in
  stdio)
    exec node /app/dist/index.js --repo "$REPO"
    ;;
  http)
    echo "blog-mcp: HTTP/SSE transport is not implemented in this build (stdio only)." >&2
    exit 1
    ;;
  *)
    echo "blog-mcp: unknown transport '$MODE' (expected 'stdio' or 'http')." >&2
    exit 1
    ;;
esac
