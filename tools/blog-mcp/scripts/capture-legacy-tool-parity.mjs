import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../dist/server.js';
import { UI_CAPABILITIES, CRON_CAPABILITIES, WATCHER_CAPABILITIES } from '../dist/serve/capabilities.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

/**
 * S20.8's "before cutover" half: captures what `tools/list` actually returns
 * from the real, compiled legacy `blog-mcp` server (via a real MCP session
 * over an in-memory transport, not static analysis of the registration
 * source) for each of its three capability-tier profiles
 * (`src/serve/capabilities.ts`).
 *
 * blog-mcp has no per-tool capability list (the GitService side's
 * `content.*`/`git.*`/... lattice does not exist here) — visibility is
 * gated purely by which `register*Tools(ctx)` call ran for a given
 * `Capabilities` object. `capabilities: []` on every entry below records
 * that honestly rather than inventing a list.
 *
 * Relabelled onto GitService's four `SessionKind` profile names so the
 * comparison script (SubZeroDev.GitService's
 * `scripts/check-blog-tool-parity.ts`) can run the same
 * `compareToolParity` GitService's own S36 harness already uses, profile
 * key to profile key. The mapping (stated per S20.8, not assumed):
 *   - `UI_CAPABILITIES`   -> both 'operator' and 'watcher'... NO, see below.
 *
 * Actual mapping used:
 *   - `UI_CAPABILITIES`    (write+remote+monitor, no scheduler) -> 'operator' AND 'mcp'
 *     blog-mcp draws no distinction between an interactive operator session
 *     and an agent MCP session; both the serve-mode UI and the default
 *     stdio/`/mcp` HTTP registration profile hold this same shape
 *     (`server.ts`'s `CreateServerOptions.capabilities` doc comment: "stdio
 *     and /mcp HTTP -- both keep using defaultCapabilities(), unchanged").
 *   - `CRON_CAPABILITIES`  (remote+monitor+scheduler, no write) -> 'scheduler'
 *   - `WATCHER_CAPABILITIES` (write+remote, no monitor/scheduler) -> 'watcher'
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

async function listFor(capabilities) {
  const server = createServer({ repoRoot, capabilities });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'legacy-tool-parity-capture', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const result = await client.listTools();
  await client.close();
  return result.tools
    .map((t) => ({ name: t.name, capabilities: [], inputSchema: t.inputSchema }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const ui = await listFor(UI_CAPABILITIES);
const cron = await listFor(CRON_CAPABILITIES);
const watcher = await listFor(WATCHER_CAPABILITIES);

const snapshot = [
  { profile: 'operator', tools: ui },
  { profile: 'mcp', tools: ui },
  { profile: 'scheduler', tools: cron },
  { profile: 'watcher', tools: watcher },
];

const outPath = path.join(repoRoot, 'tools', 'blog-mcp', 'fixtures', 'legacy-tool-parity.json');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`capture-legacy-tool-parity: wrote ${outPath}`);
for (const s of snapshot) console.log(`capture-legacy-tool-parity: profile '${s.profile}' — ${s.tools.length} tool(s) visible`);
