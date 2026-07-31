#!/usr/bin/env node
// Drives the built stdio server over a real subprocess pipe: initialize,
// list tools (asserts write tools are present/absent per BLOG_MCP_READ_ONLY),
// then calls blog_validate_posts. No test framework -- this exercises the
// actual transport, not just in-process function calls.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'dist', 'index.js');
const repoRoot = path.join(__dirname, '..', '..', '..');

// Clone-mode has no bind mount, so this smoke test clones the real repo
// (a fast, local-filesystem clone -- no network) into a scratch workspace
// rather than pointing --repo at the live checkout directly. Still
// exercises the real thing: blog_validate_posts runs against real posts.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-mcp-smoke-'));

function send(child, message) {
  child.stdin.write(JSON.stringify(message) + '\n');
}

async function main() {
  const readOnly = process.argv.includes('--read-only');
  const remote = process.argv.includes('--remote');
  const child = spawn('node', [serverEntry], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BLOG_MCP_CLONE_URL: repoRoot,
      BLOG_MCP_WORKSPACE: workspace,
      BLOG_MCP_GIT_USER_NAME: 'blog-mcp-smoke',
      BLOG_MCP_GIT_USER_EMAIL: 'blog-mcp-smoke@example.test',
      ...(readOnly ? { BLOG_MCP_READ_ONLY: '1' } : {}),
      ...(remote ? { BLOG_MCP_ALLOW_REMOTE: '1' } : {})
    }
  });

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
  });

  const responses = new Map();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined) responses.set(msg.id, msg);
    }
  });

  function waitFor(id, timeoutMs = 10000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const poll = setInterval(() => {
        if (responses.has(id)) {
          clearInterval(poll);
          resolve(responses.get(id));
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(poll);
          reject(new Error(`Timed out waiting for response id=${id}. stderr so far:\n${stderrBuf}`));
        }
      }, 50);
    });
  }

  send(child, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '0.0.0' }
    }
  });
  const initResponse = await waitFor(1);
  if (initResponse.error) throw new Error(`initialize failed: ${JSON.stringify(initResponse.error)}`);
  console.log('[smoke] initialize ok');

  send(child, { jsonrpc: '2.0', method: 'notifications/initialized' });

  send(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listResponse = await waitFor(2);
  if (listResponse.error) throw new Error(`tools/list failed: ${JSON.stringify(listResponse.error)}`);
  const toolNames = listResponse.result.tools.map((t) => t.name).sort();
  console.log(`[smoke] tools/list ok: ${toolNames.length} tools`);

  const hasWriteTool = toolNames.includes('blog_create_post');
  if (readOnly && hasWriteTool) throw new Error('BLOG_MCP_READ_ONLY=1 but blog_create_post is still registered.');
  if (!readOnly && !hasWriteTool) throw new Error('blog_create_post is missing from the default (non-read-only) tool list.');
  console.log(`[smoke] capability gating ok (readOnly=${readOnly})`);

  const hasRemoteTool = toolNames.includes('blog_push');
  const remoteExpected = remote && !readOnly;
  if (remoteExpected && !hasRemoteTool) throw new Error('BLOG_MCP_ALLOW_REMOTE=1 but blog_push is not registered.');
  if (!remoteExpected && hasRemoteTool) throw new Error('blog_push is registered without BLOG_MCP_ALLOW_REMOTE=1 (or despite read-only).');
  console.log(`[smoke] remote gating ok (remote=${remote}, readOnly=${readOnly})`);

  if (!toolNames.includes('blog_validate_posts')) throw new Error('blog_validate_posts is missing from tools/list.');

  send(child, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'blog_validate_posts', arguments: {} }
  });
  const validateResponse = await waitFor(3);
  if (validateResponse.error) throw new Error(`blog_validate_posts failed: ${JSON.stringify(validateResponse.error)}`);
  const structured = validateResponse.result.structuredContent;
  if (structured.ok !== true) {
    throw new Error(`blog_validate_posts reported findings against the real repo (golden anchor should be clean): ${JSON.stringify(structured, null, 2)}`);
  }
  console.log('[smoke] blog_validate_posts ok:', structured.summary);

  child.kill();
  console.log('[smoke] ALL CHECKS PASSED');
}

main()
  .catch((err) => {
    console.error('[smoke] FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });
