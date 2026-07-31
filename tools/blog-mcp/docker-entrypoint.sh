#!/bin/sh
# Selects transport (argv[1] > BLOG_MCP_TRANSPORT > stdio). Repo acquisition
# (clone or reconcile BLOG_MCP_CLONE_URL into BLOG_MCP_WORKSPACE/repo) happens
# inside the server process itself (src/bootstrap/repo.ts), not here -- so it
# is unit-testable and its outcome is part of the same startup log stream.
# POSIX sh, not bash -- keeps the runtime image minimal.
set -eu

WORKSPACE="${BLOG_MCP_WORKSPACE:-/workspace}"

# The clone doesn't necessarily exist yet on first boot, but safe.directory
# doesn't require the path to exist -- set it unconditionally so a restored
# volume carrying a different uid never hits "detected dubious ownership".
git config --global --add safe.directory "$WORKSPACE/repo"

if [ -n "${GH_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; then
  # blog_push authenticates over HTTPS via gh's own credential helper, so
  # the token is read from GH_TOKEN/gh's own auth state at push time and
  # never written into a .git-credentials file in the volume.
  git config --global credential.helper '!gh auth git-credential'
fi

MODE="${1:-${BLOG_MCP_TRANSPORT:-stdio}}"

case "$MODE" in
  stdio)
    exec node /app/dist/index.js
    ;;
  http)
    exec node /app/dist/http-bin.js
    ;;
  *)
    echo "blog-mcp: unknown transport '$MODE' (expected 'stdio' or 'http')." >&2
    exit 1
    ;;
esac
