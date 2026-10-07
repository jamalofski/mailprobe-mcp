// Compares the instructions and the tool definitions of this package with those of the
// remote MailProbe server: an assistant must find the same tools on both. The remote
// server answers `initialize` and `tools/list` without an API key.
import assert from 'node:assert/strict';

import { INSTRUCTIONS, TOOLS } from '../src/tools.js';
import { SERVER_URL } from './names.mjs';

async function ask(method, params) {
  const response = await fetch(SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${SERVER_URL} answered HTTP ${response.status} to ${method}`);
  return (await response.json()).result;
}

let failed = false;
const compare = (what, local, remote) => {
  try {
    assert.deepEqual(local, remote);
  } catch (error) {
    failed = true;
    console.error(`${what} differ from the remote server:\n${error.message}\n`);
  }
};

const { instructions } = await ask('initialize', {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'mailprobe-mcp-check-tools', version: '1' },
});
compare('The instructions', INSTRUCTIONS, instructions);

const { tools } = await ask('tools/list');
compare('The names of the tools', TOOLS.map((tool) => tool.name), tools.map((tool) => tool.name));
for (const tool of TOOLS) {
  const remote = tools.find((candidate) => candidate.name === tool.name);
  if (remote) compare(`The definitions of ${tool.name}`, tool, remote);
}

if (failed) process.exit(1);
console.log(`The instructions and the ${TOOLS.length} tools are those of the remote server: ${TOOLS.map((tool) => tool.name).join(', ')}`);
