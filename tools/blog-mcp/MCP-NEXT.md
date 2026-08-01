# MCP Next implementation plan

Status: proposed; no behavior described in this document is implemented until
the corresponding phase is merged and validated.

## 1. Purpose

MCP Next will separate Blog-Bot's domain operations from the mechanics of
exposing those operations through Model Context Protocol (MCP). The target is a
small, reusable MCP runtime that receives an explicit contract at build time,
compiles that contract into an immutable tool registry, and exposes only that
registry to MCP clients.

The first consumer is `tools/blog-mcp`. A second consumer is required before
the reusable pieces move to a separate repository or independently versioned
package. Until then, this repository remains the proving ground and owns only
the Blog-Bot integration plus the minimum generic runtime needed by it.

The official MCP TypeScript SDK remains responsible for MCP framing,
transports, schemas, discovery, and authorization integration. MCP Next must
not implement JSON-RPC or OAuth wire protocols by hand.

## 2. Goals

1. Declare every exposed tool in one contract with a stable name,
   documentation, input and output schemas, authorization scopes, behavioral
   annotations, capability requirements, and an execution target.
2. Validate the complete contract during the build and fail before producing
   a deployable image when it is incomplete, contradictory, or unsafe.
3. Generate the registry used by MCP `tools/list` and `tools/call`; discovery
   and execution must consume the same generated artifact.
4. Preserve the existing Blog-Bot domain functions, repository mutex, audit
   log, path allowlists, result envelope, and per-consumer capability profiles.
5. Support native TypeScript handlers first and selected OpenAPI operations
   second, normalizing both sources into one internal representation.
6. Make read, write, remote, monitoring, and scheduler authority explicit and
   enforce it before a handler executes.
7. Make the generic runtime an OAuth resource server. Support a separate
   authorization server by default and an optional SDK-backed embedded
   provider for the single-operator Blog-Bot deployment.
8. Produce deterministic artifacts that are testable without opening a
   transport or inspecting private SDK fields.

## 3. Non-goals

- MCP Next will not infer tools by scanning arbitrary application source at
  runtime.
- It will not expose every operation found in an OpenAPI document by default.
- It will not accept a caller-supplied upstream URL, command, executable, file
  path, HTTP method, or handler module unless that value is explicitly modeled
  as safe input by the contract.
- It will not become a general workflow engine. Multi-step publishing remains
  Blog-Bot domain behavior rather than a generic contract feature.
- It will not replace Docusaurus, the documentation gates, GitHub Actions, or
  the existing repository publishing policy.
- It will not combine the SDK v2 migration, contract migration, OAuth rewrite,
  and every Blog-Bot tool conversion in one pull request.
- It will not claim backward compatibility until parity tests demonstrate it.

## 4. Current-state evidence

The current implementation already provides useful boundaries:

- `src/server.ts` creates a transport-independent `McpServer` and registers
  tool groups.
- `src/tools/*.ts` combines MCP metadata with calls into domain and execution
  modules.
- `src/tools/context.ts` centralizes error conversion, mutation locking, audit
  logging, and capability profiles.
- `src/http.ts` owns Streamable HTTP session lifecycle, origin checks, static
  bearer authentication, and OAuth token-to-capability mapping.
- `src/serve/oauth.ts` currently implements authorization-server protocol
  behavior and process-local client, code, and token storage directly.
- `src/domain/` and `src/exec/` contain most of the behavior that should remain
  independent of MCP.

The primary migration seam is therefore between tool declaration and tool
execution. Domain code should not be rewritten merely to adopt the contract.

## 5. Architectural decisions

### 5.1 Contract-first, immutable discovery

The build produces one normalized registry. The runtime registers tools from
that registry, and MCP clients discover those exact declarations through
`tools/list`. There is no separate hand-maintained discovery document.

An optional authenticated `GET /contract` endpoint may return the sanitized
generated manifest and its fingerprint for diagnostics. It must omit handler
module paths, upstream credentials, secret references, and internal policy
details. It is not required for MCP interoperability.

### 5.2 SDK-neutral contract, SDK-specific runtime adapter

The contract and compiler must not expose SDK classes in their public types.
An SDK adapter translates the normalized registry into the selected official
MCP TypeScript SDK version. This keeps the contract stable across SDK
upgrades.

New runtime work targets the official SDK v2 package line. The existing v1
server stays deployable while parity is built. The exact v2 versions are
pinned when implementation begins; broad dependency ranges are not used for
the transport or authorization layer. A short compatibility spike must verify
Streamable HTTP, stdio, tool output schemas, cancellation, authorization
middleware, and shutdown behavior before the first runtime PR proceeds.

### 5.3 Explicit adapters

Every executable declaration names one adapter and one operation known at
build time:

- `module`: invokes a function from an explicit application handler catalog.
- `http`: invokes a fixed operation imported from OpenAPI and an MCP overlay.

No generic shell adapter is included in the initial architecture. Existing
Blog-Bot command execution remains behind its typed domain handlers, where the
repository already controls arguments, working directories, scrubbing, and
errors.

### 5.4 Resource server by default

The generic runtime validates access tokens, audience/resource indicators,
and scopes. User login, consent, client registration, and token issuance
belong to an authorization-server adapter.

Two deployment choices are supported:

1. **External authorization server (preferred generic mode):** MCP Next
   publishes protected-resource metadata for a configured issuer and verifies
   that issuer's tokens.
2. **Embedded Blog-Bot authorization provider:** an optional package uses the
   official SDK authorization router/provider interfaces, the existing
   operator login, and durable storage. This preserves the self-contained
   Blog-Bot container without keeping hand-written OAuth protocol handlers in
   `serve/oauth.ts`.

The embedded provider is not part of the generic runtime core.

### 5.5 Build-time allowlisting for OpenAPI

An OpenAPI document is an input catalogue, not permission to expose an API.
Every imported operation must be selected by stable `operationId` in a
separate overlay. An operation absent from the overlay is not generated. An
overlay entry may further hide request fields, pin parameter values, rename
the tool, replace descriptions, map schemas, set scopes, and classify side
effects.

## 6. Proposed repository layout

During the first-consumer phase:

```text
tools/
  mcp-next/
    src/
      contract/       # public contract types and schema
      compiler/       # normalization, validation, generation
      runtime/        # SDK-independent runtime services
      sdk-v2/         # official MCP SDK adapter
      adapters/
        module/
        http/
      auth/
        resource-server/
        embedded/     # optional; Blog-Bot uses this initially
    test/
  blog-mcp/
    mcp.contract.ts
    src/
      handlers/       # explicit operation catalogue
      generated/      # compiler output; policy decided in section 11
      domain/
      exec/
      ...
```

This layout is provisional. If no second consumer appears, `mcp-next` remains
an internal workspace package rather than being published as a framework.

## 7. Contract specification

### 7.1 Canonical internal model

All native and OpenAPI inputs normalize to this conceptual shape:

```ts
interface McpContract {
  contractVersion: 1;
  server: {
    name: string;
    version: string;
    title?: string;
    instructions?: string;
  };
  tools: ToolContract[];
}

interface ToolContract {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  execution: ModuleExecution | HttpExecution;
  authorization: {
    scopes: string[];
  };
  capabilities: string[];
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  limits?: {
    timeoutMs?: number;
    maximumResultBytes?: number;
  };
}

interface ModuleExecution {
  adapter: 'module';
  operation: string;
}

interface HttpExecution {
  adapter: 'http';
  operationId: string;
  upstream: string;
}
```

Implementation types may be stricter, but they must preserve these concepts.
The canonical generated manifest uses JSON Schema, even when a native
TypeScript contract uses Zod or another Standard Schema implementation for
authoring convenience.

### 7.2 Native contract example

```ts
export default defineMcpContract({
  contractVersion: 1,
  server: {
    name: 'subzerodev-blog-mcp',
    version: '0.2.0'
  },
  tools: [
    defineModuleTool({
      name: 'blog_list_tags',
      title: 'List blog tags',
      description: 'Return the controlled tag vocabulary for blog posts.',
      inputSchema: emptyInput,
      outputSchema: listTagsOutput,
      execution: { adapter: 'module', operation: 'listTags' },
      authorization: { scopes: ['blog:read'] },
      capabilities: ['content.read'],
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    })
  ]
});
```

### 7.3 Handler catalogue

The application exports an explicit operation map. The generic runtime never
resolves a module path supplied by an MCP client or deployment variable.

```ts
export const blogHandlers = defineHandlerCatalog({
  listTags: async (_input, context) => listTags(context.repoRoot),
  createPost: async (input, context) => createPost(context, input)
});
```

The build fails when a contract references a missing operation or when the
catalogue contains an operation that is unintentionally unreachable. An
explicit `internal: true` catalogue marker may document operations that are
deliberately not exposed.

### 7.4 OpenAPI overlay example

```yaml
contractVersion: 1
source: ./openapi.json
upstreams:
  blog-api:
    baseUrlFrom: BLOG_API_BASE_URL
operations:
  getTags:
    expose: true
    toolName: blog_list_tags
    title: List blog tags
    scopes: [blog:read]
    capabilities: [content.read]
    annotations:
      readOnlyHint: true
      destructiveHint: false
      idempotentHint: true
      openWorldHint: true
  deletePost:
    expose: false
```

`baseUrlFrom` names an allowed configuration key; its value is never embedded
in the generated manifest. Security-sensitive headers are configured by
server-side credential references and cannot appear in MCP input schemas.

### 7.5 Stability rules

- Tool names are public API identifiers and must remain stable after release.
- Contract versions describe the contract file format, not the application
  release.
- Renaming or removing a tool is a breaking change and requires a documented
  deprecation period or an explicit major application version change.
- Additive optional input fields are compatible; new required fields are
  breaking.
- Narrowing an output schema or scope is reviewed as a behavioral change.
- The generated contract fingerprint changes whenever client-visible metadata
  or execution policy changes.

## 8. Compiler behavior

The compiler performs these steps in a deterministic order:

1. Load one native contract or one OpenAPI document plus overlay.
2. Validate the source against the versioned contract schema.
3. Resolve handler-catalogue operations or selected OpenAPI `operationId`s.
4. Normalize schemas, metadata, scopes, capabilities, annotations, and limits.
5. Run semantic safety validation.
6. Sort tools and object keys deterministically.
7. Emit the runtime registry, sanitized manifest, type declarations, human
   documentation, and SHA-256 contract fingerprint.
8. Re-read emitted artifacts and validate them before completing the build.

The compiler rejects:

- duplicate, invalid, or reserved tool names;
- empty titles or descriptions;
- missing input or output schemas;
- schemas that cannot be represented by the selected SDK;
- undeclared handlers or OpenAPI operations;
- write/destructive tools marked read-only;
- mutating tools with no authorization scope or capability requirement;
- HTTP operations with an unconfigured upstream;
- caller-controlled upstream origins or credential headers;
- path parameters not represented in the input schema;
- unsupported content types;
- unbounded binary or streaming output in the first implementation;
- limits outside centrally configured minimum and maximum values.

Warnings are not sufficient for security invariants. A contract that violates
one must fail the build.

## 9. Generic runtime behavior

### 9.1 Startup

At startup the runtime:

1. Loads the generated registry and verifies its fingerprint.
2. Loads deployment configuration and secret references.
3. Constructs the selected adapters and authorization verifier.
4. Verifies that every registry operation has exactly one executor.
5. Registers tools with the official MCP SDK.
6. Starts configured transports only after readiness checks pass.

A mismatch between registry, handlers, credentials, or authorization metadata
is fatal. The service must not start partially with a smaller accidental tool
set.

### 9.2 Tool calls

For every call, the runtime performs this pipeline:

```text
identify tool
  -> authenticate caller
  -> enforce scopes
  -> enforce consumer capabilities
  -> validate input
  -> apply timeout/cancellation/result limits
  -> invoke adapter
  -> validate output
  -> scrub and audit outcome
  -> convert to MCP result
```

Authorization and capability checks occur before invoking a handler. Output
validation occurs before any structured content is returned to the client.

### 9.3 Errors

The runtime defines stable application error categories:

- `validation`: caller input does not satisfy the contract;
- `authorization`: token, audience, scope, or capability is insufficient;
- `precondition`: request is valid but repository/application state prevents
  it;
- `conflict`: another operation or state transition conflicts;
- `upstream`: a declared HTTP or external service failed;
- `timeout`: the operation exceeded its declared limit;
- `infrastructure`: an unexpected runtime or environment failure.

Sensitive command output, tokens, cookies, headers, local paths, and stack
traces are never returned through MCP. Existing Blog-Bot result-envelope
semantics remain stable during migration unless a separate compatibility
decision changes them.

### 9.4 Capabilities and scopes

Scopes describe authority granted by the resource owner. Capabilities describe
authority enabled for a particular server-side consumer profile. Both must
allow the operation.

Initial scope vocabulary:

- `blog:read`: repository, content, validation, CI, and deploy reads;
- `blog:write`: content, local git, scheduling, and enabled remote mutations.

Initial capability vocabulary maps the current profiles more precisely:

- `content.read`
- `content.write`
- `git.local.write`
- `github.remote.write`
- `github.monitor`
- `scheduler.manage`

The Blog-Bot stdio, primary HTTP, read-only HTTP, UI, cron, and watcher
profiles must be represented as explicit sets. A tool is omitted from
`tools/list` when its required capabilities are unavailable to that session.
It must also be rejected at dispatch if a stale or malicious caller attempts
to invoke it by name.

## 10. Adapter specifications

### 10.1 Module adapter

- Receives only validated input and an application context.
- Resolves operations from the build-linked handler catalogue.
- Supports `AbortSignal` and a request correlation ID.
- Returns domain output, not an SDK-specific result.
- Cannot import modules from contract strings at runtime.
- Preserves Blog-Bot's repository lock and audit behavior through declarative
  middleware attached to mutating tool metadata.

### 10.2 HTTP adapter

- Resolves a fixed upstream and operation selected at build time.
- Maps only declared path, query, header, and body parameters.
- Rejects redirects by default; an overlay must opt into a bounded same-origin
  redirect policy when required.
- Applies DNS/IP and origin policy to prevent server-side request forgery.
- Uses server-side credential providers; callers never provide authorization
  headers.
- Enforces connection, response, and total timeouts.
- Caps request and response sizes.
- Accepts JSON initially. Other media types require a later contract version.
- Maps non-success responses into scrubbed `upstream` errors.
- Never returns upstream cookies or undeclared headers.

## 11. Generated artifacts

The initial implementation should generate:

- `registry.generated.ts`: build-linked runtime declarations;
- `contract.generated.json`: sanitized normalized contract;
- `contract.generated.d.ts`: generated operation input/output types where
  useful;
- `TOOLS.generated.md`: human-readable tool catalogue;
- `contract.sha256`: deterministic fingerprint.

The first compiler PR must decide, in an architecture decision record, whether
these files are committed or generated only during CI/container builds. The
decision criteria are reproducible local builds, reviewability, merge-conflict
cost, and whether consumers install from source or from a package. Whichever
policy is selected must be enforced by a clean-tree regeneration check.

## 12. Authorization and token storage

### 12.1 Resource-server requirements

- Publish OAuth protected-resource metadata for the canonical MCP URI.
- Return the appropriate `WWW-Authenticate` resource metadata challenge.
- Validate issuer, signature or introspection result, expiry, audience/resource
  indicator, and scopes.
- Never pass an upstream OAuth access token through to a different service.
- Keep static bearer tokens only as an explicit local/compatibility mode, not
  the default public deployment architecture.

### 12.2 Embedded Blog-Bot provider

The optional embedded provider uses official SDK authorization helpers and
implements the SDK provider/store contracts. It must support:

- OAuth authorization-code flow with S256 PKCE;
- public clients and dynamic client registration;
- Claude callback URLs currently required by the deployment;
- authorization-server metadata;
- resource indicators bound to the canonical `/mcp` URI;
- `blog:read` and `blog:write` consent;
- short-lived, one-use authorization codes;
- short-lived access tokens;
- rotating refresh tokens with reuse detection;
- token revocation;
- registration, login, authorization, and token-endpoint rate limits;
- durable client and grant state across container restarts.

Durable storage uses a transactional store on the named workspace volume. The
first implementation should use SQLite unless the implementation spike shows
that its container/runtime cost is disproportionate. Opaque authorization
codes, access tokens, refresh tokens, and session identifiers are stored only
as keyed hashes. Database migrations are explicit, forward-only, backed up
before mutation, and covered by restart tests. The UI password hash remains a
deployment secret and is never stored in this database.

The current process-local `OAuthService` remains until the SDK-backed provider
passes interoperability and restart tests. Removal occurs in a separate PR.

## 13. Security requirements

- Default deny: undeclared tools and OpenAPI operations do not exist.
- Least privilege: a tool requires both granted scopes and enabled server-side
  capabilities.
- Capability filtering affects discovery and dispatch.
- Mutating Blog-Bot operations retain the repository mutex, write-path
  allowlist, and scrubbed append-only audit log.
- Contract and generated artifacts contain no secrets.
- Secret configuration uses named environment references or a provider
  interface, never contract values.
- Input and output validation is mandatory for every operation.
- Limits have safe runtime defaults even when a contract omits optional
  overrides.
- Logs identify contract fingerprint, tool, duration, result category, and
  correlation ID without logging tool bodies by default.
- HTTP adapter egress is allowlisted and protected against private-address DNS
  rebinding unless a deployment explicitly permits a private upstream.
- Dependency versions for protocol, transport, authorization, and schema
  generation are pinned and reviewed.
- Generated files are treated as untrusted compiler output until validation
  succeeds.

## 14. Observability and operations

Required endpoints and signals:

- `/healthz`: process is alive;
- `/readyz`: registry, handlers, storage, and auth verifier are ready;
- `/version`: application version, SDK adapter version, contract version, and
  contract fingerprint;
- structured logs for startup, session lifecycle, authorization failures,
  tool duration, cancellation, timeout, and result category;
- counters for calls, failures, active sessions, authorization outcomes, and
  adapter/upstream failures;
- latency distributions per tool without high-cardinality client identifiers.

The container build labels include source revision and contract fingerprint.
The deployment health check uses `/readyz`, while liveness uses `/healthz`.

## 15. Testing strategy

### 15.1 Contract and compiler tests

- valid native contract snapshot;
- valid OpenAPI plus overlay snapshot;
- deterministic output across repeated clean builds;
- duplicate names, missing handlers, contradictory annotations, unknown
  scopes, unsafe HTTP mappings, and schema failures all reject the build;
- no unselected OpenAPI operation appears in generated output;
- generated manifest and runtime registry have identical public metadata.

### 15.2 Runtime contract tests

- `tools/list` equals the generated registry for each consumer profile;
- every listed tool can be dispatched to exactly one executor;
- every unlisted tool is rejected;
- input and output validation failures produce stable error categories;
- timeout, cancellation, and result-size limits are enforced;
- scope and capability matrices are tested independently and together;
- audit and lock middleware runs for every mutating operation and no read-only
  operation acquires the mutation lock unnecessarily.

### 15.3 Transport tests

- stdio initialize/list/call round trip;
- Streamable HTTP initialize/list/call/delete and session expiry;
- origin allowlist and session admission limits;
- graceful shutdown drains sessions and stops background timers;
- v1 and v2 parity fixture during migration.

### 15.4 OAuth interoperability tests

- protected-resource and authorization-server metadata;
- dynamic registration with Claude-compatible metadata;
- authorization-code exchange with S256 PKCE;
- invalid redirect URI, audience, verifier, scope, and client rejection;
- read-only consent produces no write tools;
- refresh rotation and replay rejection;
- revocation;
- restart between registration and authorization;
- restart between refresh-token issuance and refresh;
- static-token compatibility mode remains isolated from OAuth capabilities.

### 15.5 Blog-Bot parity tests

Capture a versioned fixture of current tool names and client-visible metadata.
For each profile, compare the current v1 server with MCP Next. Each migrated
handler also keeps its existing focused domain tests. The migration is complete
only when all intended tools have parity or an approved compatibility note.

Existing repository checks remain required:

```powershell
./build/Test-Documentation.ps1
./build/Test-DocumentationArtifact.ps1
git diff --check
git status --short --branch
```

The Blog-Bot package must continue to pass:

```powershell
Set-Location tools/blog-mcp
npm run build
npm test
```

## 16. Migration and delivery plan

Each phase is a focused pull request with its own acceptance criteria. The
deployed v1 service remains the rollback target until the final cutover.

### Phase 0: architecture records and SDK v2 spike

Deliverables:

- record contract source, generated-artifact policy, package boundary, storage
  choice, and external-versus-embedded auth responsibilities;
- pin an SDK v2 version in an isolated spike;
- prove stdio, Streamable HTTP, tool schemas, cancellation, and auth middleware;
- document differences from the current v1 behavior.

Acceptance:

- no production entry point changes;
- representative round trips work in tests;
- unresolved SDK incompatibilities are explicit blockers, not assumptions.

### Phase 1: contract core and compiler

Deliverables:

- versioned contract schema and TypeScript authoring helpers;
- canonical internal representation;
- semantic validator and deterministic generator;
- generated manifest, fingerprint, documentation, and registry for three
  read-only Blog-Bot tools.

Acceptance:

- clean regeneration is deterministic;
- negative safety fixtures fail the build;
- generated declarations match current `tools/list` metadata for the pilot
  tools.

### Phase 2: generic SDK v2 runtime and module adapter

Deliverables:

- SDK-neutral dispatch pipeline;
- SDK v2 registration adapter;
- module handler catalogue;
- validation, standard errors, limits, cancellation, and observability;
- stdio and Streamable HTTP test harnesses.

Acceptance:

- the pilot tools run end to end without bespoke registration calls;
- discovery and dispatch use the same registry;
- undeclared and under-authorized calls cannot reach handlers.

### Phase 3: capabilities and Blog-Bot read-only migration

Deliverables:

- explicit capability vocabulary and profile definitions;
- migration of all read-only content, repository, validation, CI, and deploy
  tools;
- parity fixtures for each affected profile.

Acceptance:

- read-only clients see no write, remote-write, or scheduler tools;
- current result envelopes and hard published-URL rule remain intact;
- existing read-only tests pass through the generated runtime.

### Phase 4: Blog-Bot mutation migration

Deliverables:

- migration of authoring, local git, remote GitHub, and scheduling tools;
- declarative mutation middleware for lock, audit, and path policy;
- write/destructive/idempotency annotation review for every tool.

Acceptance:

- every mutation retains current locking, auditing, environment gates, and
  allowlists;
- capability profiles match current UI, HTTP, cron, and watcher behavior;
- no manually registered Blog-Bot tool remains.

### Phase 5: SDK-backed authorization

Deliverables:

- generic resource-server verifier and metadata;
- optional embedded Blog-Bot provider using official SDK helpers;
- durable token/client store and migrations;
- OAuth consent UI integration and static-token compatibility mode.

Acceptance:

- Claude can dynamically register, authorize, list tags, refresh, reconnect
  after container restart, and revoke access;
- read consent cannot invoke or discover write tools;
- hand-written OAuth protocol routing is removed only after all compatibility
  tests pass.

### Phase 6: OpenAPI importer and HTTP adapter

Deliverables:

- OpenAPI parser and explicit overlay schema;
- safe parameter/schema normalization;
- fixed-upstream HTTP adapter with credential providers and egress policy;
- fixtures proving unselected operations stay inaccessible.

Acceptance:

- an example API produces deterministic MCP tools from selected
  `operationId`s;
- destructive and administrative operations are absent unless explicitly
  reviewed and selected;
- redirects, credentials, size limits, and SSRF protections are tested.

### Phase 7: cutover and cleanup

Deliverables:

- MCP Next becomes the Blog-Bot production entry point;
- old registration and OAuth implementation is removed;
- Docker, Compose, CI, deployment, README, and operator documentation updates;
- rollback procedure and compatibility report.

Acceptance:

- complete local suite and required GitHub checks pass;
- image smoke tests cover stdio, HTTP, OAuth, persistence, and readiness;
- deployed Claude connector and representative Blog-Bot operations pass;
- rollback to the previous image is documented and tested;
- only after a successful observation window is the v1 path deleted.

### Phase 8: extraction decision

After a second real consumer implements a contract, decide whether to extract
the generic packages. Evidence must include duplicated needs, versioning
requirements, and independent release value. Without that evidence, keep the
runtime internal to avoid creating an unsupported framework product.

## 17. Definition of done

MCP Next is complete for Blog-Bot when:

- every exposed tool originates from the versioned contract;
- build output and `tools/list` cannot drift;
- all input and output are schema-validated;
- scope and capability enforcement occurs before execution;
- OAuth protocol behavior uses official SDK integration and durable state;
- Claude reconnects across container restarts;
- existing Blog-Bot safety invariants and published-route rules remain true;
- both transports, all consumer profiles, and all tool categories have parity
  coverage;
- deployment can identify the running source revision and contract
  fingerprint;
- no undeclared OpenAPI operation or runtime-discovered handler can be called;
- operator documentation covers configuration, migration, backup, recovery,
  revocation, and rollback.

## 18. Decisions required before implementation

The following questions must be settled in Phase 0 and recorded as architecture
decisions:

1. Whether generated artifacts are committed or CI-only.
2. The exact pinned MCP SDK v2 and middleware packages.
3. Whether the initial durable OAuth store is SQLite or another transactional
   store compatible with the existing named-volume deployment.
4. Whether the production Blog-Bot deployment initially uses embedded OAuth
   or an external authorization server.
5. The final scope-to-capability matrix for remote monitoring, scheduling, and
   auto-merge.
6. The compatibility and deprecation policy for existing tool metadata and
   static bearer tokens.
7. Whether `/contract` is operator-only or omitted entirely.
8. The minimum second-consumer evidence required before package extraction.

These are implementation decisions, not reasons to weaken the contract's
default-deny and build-time validation requirements.
