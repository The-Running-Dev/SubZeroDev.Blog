# S20 -- the blog's derived image. Same three-stage shape as
# SubZeroDev.GitService's own Dockerfile and S35's example-consumer/Dockerfile
# (base tools + this workspace's own 16 content-authoring + 5 git-utility
# tools, compiled into one registry with one fingerprint, compiler absent
# from the runtime stage).
#
# Per the 2026-08-21 decision log entry ("S20's derived-image build reaches
# the base's source via a sibling checkout and Docker's --build-context"):
# the base's src/, package.json and package-lock.json are supplied as a
# second, named BuildKit context. The two repositories are laid out inside
# the image as siblings under /repos, mirroring the local dev layout
# exactly (both repos side by side under Dropbox/Projects) -- so every
# relative import in tools/git-service-consumer/*.ts
# (../../../SubZeroDev.GitService/src/...) resolves identically inside the
# image and outside it, with no import-path rewriting. Build from the blog
# repository root:
#
#   docker build -f tools/git-service-consumer/Dockerfile \
#     --build-context gitservice=../SubZeroDev.GitService \
#     -t subzerodev-blog-consumer .

# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS builder
WORKDIR /repos

# The base repository, from the sibling context.
WORKDIR /repos/SubZeroDev.GitService
COPY --from=gitservice package.json package-lock.json ./
COPY --from=gitservice console/package.json ./console/package.json
RUN --mount=type=cache,target=/root/.npm npm ci
COPY --from=gitservice tsconfig.json ./
COPY --from=gitservice scripts ./scripts
COPY --from=gitservice src ./src
COPY --from=gitservice console ./console
# The base's own, unmodified console -- S20 adds no new views (that is
# S37's job); this consumer just needs a valid, boot-verifiable bundle.
RUN npm run build:console

# The blog repository (this Dockerfile's own build context).
WORKDIR /repos/SubZeroDev.Blog-S20
COPY tools/blog-mcp/package.json tools/blog-mcp/package-lock.json ./tools/blog-mcp/
RUN --mount=type=cache,target=/root/.npm npm ci --prefix tools/blog-mcp
COPY tools/blog-mcp/tsconfig.json ./tools/blog-mcp/tsconfig.json
COPY tools/blog-mcp/src ./tools/blog-mcp/src
RUN npx --prefix tools/blog-mcp tsc -p tools/blog-mcp/tsconfig.json

COPY tools/git-service-consumer/server.ts ./tools/git-service-consumer/server.ts
COPY tools/git-service-consumer/declarations.ts ./tools/git-service-consumer/declarations.ts
COPY tools/git-service-consumer/extra-declarations.ts ./tools/git-service-consumer/extra-declarations.ts
COPY tools/git-service-consumer/scripts ./tools/git-service-consumer/scripts
RUN node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/git-service-consumer/scripts/build-registry.ts

FROM builder AS trimmed
RUN rm -f /repos/SubZeroDev.GitService/src/contract/compiler.ts

FROM node:22-bookworm-slim AS runtime
WORKDIR /repos/SubZeroDev.Blog-S20

# git/gh, the same as the base's own runtime stage, plus PowerShell --
# run_doc_gate/run_artifact_check shell out to build/*.ps1 the same way
# blog-mcp's own runtime always has.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl gnupg wget apt-transport-https software-properties-common \
  && mkdir -p -m 755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list >/dev/null \
  && wget -q https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb \
  && dpkg -i /tmp/packages-microsoft-prod.deb \
  && rm -f /tmp/packages-microsoft-prod.deb \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh powershell \
  && apt-get purge -y curl gnupg wget apt-transport-https software-properties-common \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repos/SubZeroDev.GitService
COPY --from=gitservice package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=trimmed /repos/SubZeroDev.GitService/src ./src
COPY --from=builder /repos/SubZeroDev.GitService/console/dist ./console/dist

WORKDIR /repos/SubZeroDev.Blog-S20
COPY tools/blog-mcp/package.json ./tools/blog-mcp/package.json
COPY --from=builder /repos/SubZeroDev.Blog-S20/tools/blog-mcp/node_modules ./tools/blog-mcp/node_modules
COPY --from=builder /repos/SubZeroDev.Blog-S20/tools/blog-mcp/dist ./tools/blog-mcp/dist
COPY --from=trimmed /repos/SubZeroDev.Blog-S20/tools/git-service-consumer/server.ts ./tools/git-service-consumer/server.ts
COPY --from=trimmed /repos/SubZeroDev.Blog-S20/tools/git-service-consumer/declarations.ts ./tools/git-service-consumer/declarations.ts
COPY --from=trimmed /repos/SubZeroDev.Blog-S20/tools/git-service-consumer/extra-declarations.ts ./tools/git-service-consumer/extra-declarations.ts
COPY --from=builder /repos/SubZeroDev.Blog-S20/tools/git-service-consumer/build ./tools/git-service-consumer/build

ENV VOLUME_ROOT=/data
ENV CREDENTIAL_MOUNT_ROOT=/credentials
VOLUME ["/data"]

ARG GIT_COMMIT_SHA
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

EXPOSE 8080

ENTRYPOINT ["node", "--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "tools/git-service-consumer/server.ts"]
