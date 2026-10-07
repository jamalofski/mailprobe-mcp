// The real binary, started as an MCP client starts it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { BIN, CREDITS, entry, fakeApi, startServer } from './helpers.js';

const { version } = createRequire(import.meta.url)('../package.json');

const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1.0.0' },
};

test('handshake, tool list and a clean exit when the input closes', { timeout: 20_000 }, async (t) => {
  const server = startServer(t);
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  const init = JSON.parse(await server.line());
  assert.equal(init.result.protocolVersion, '2025-11-25');
  assert.deepEqual(init.result.serverInfo, { name: 'mailprobe', title: 'MailProbe', version, websiteUrl: 'https://mailprobe.dev/' });
  assert.match(init.result.instructions, /^MailProbe checks whether email addresses exist/);

  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const list = JSON.parse(await server.line());
  assert.equal(list.id, 2);
  assert.deepEqual(list.result.tools.map((tool) => tool.name), ['verify_emails', 'get_credits']);
  assert.equal(await server.stop(), 0);
});

test('2026-07-28 without a handshake: discover, then a call that verifies addresses', { timeout: 20_000 }, async (t) => {
  const api = await fakeApi();
  t.after(() => api.close());
  const server = startServer(t, { MAILPROBE_API_KEY: 'mp_live_test', MAILPROBE_API_URL: api.url });

  server.send({ jsonrpc: '2.0', id: 'd', method: 'server/discover', params: { _meta: META } });
  const discover = JSON.parse(await server.line());
  assert.equal(discover.result.resultType, 'complete');
  assert.equal(discover.result.supportedVersions[0], '2026-07-28');

  server.send({ jsonrpc: '2.0', id: 'c', method: 'tools/call', params: { name: 'verify_emails', arguments: { emails: ['jane@example.com'] }, _meta: META } });
  const called = JSON.parse(await server.line());
  assert.equal(called.result.resultType, 'complete');
  assert.deepEqual(called.result.structuredContent, { results: [entry('jane@example.com')] });
  assert.equal(api.calls[0].headers['user-agent'], `mailprobe-mcp/${version}`);
  assert.equal(api.calls[0].headers.authorization, 'Bearer mp_live_test');

  server.send({ jsonrpc: '2.0', id: 'q', method: 'tools/call', params: { name: 'get_credits', arguments: {}, _meta: META } });
  assert.deepEqual(JSON.parse(await server.line()).result.structuredContent, CREDITS);
  assert.equal(await server.stop(), 0);
});

test('a line that is not JSON gets a parse error and the server keeps going', { timeout: 20_000 }, async (t) => {
  const server = startServer(t);
  server.send('{"jsonrpc": ');
  server.send({ jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.deepEqual(JSON.parse(await server.line()), { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: the line is not valid JSON' } });
  assert.deepEqual(JSON.parse(await server.line()), { jsonrpc: '2.0', id: 1, result: {} });
  assert.equal(await server.stop(), 0);
});

test('without an API key, or with a blank one, a call says how to set the key and the API is not called', { timeout: 20_000 }, async (t) => {
  const api = await fakeApi();
  t.after(() => api.close());
  for (const key of ['', '   ']) {
    const server = startServer(t, { MAILPROBE_API_KEY: key, MAILPROBE_API_URL: api.url });
    server.send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_credits', arguments: {} } });
    const { result } = JSON.parse(await server.line());
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /^No MailProbe API key\. Set the MAILPROBE_API_KEY environment variable/);
    assert.match(result.content[0].text, /dashboard\/#\/developer/);
    assert.equal(await server.stop(), 0);
  }
  assert.equal(api.calls.length, 0);
});

test('closing the input while a verification runs stops the server', { timeout: 20_000 }, async (t) => {
  let release;
  const api = await fakeApi((call) => (call.method === 'POST' ? new Promise((resolve) => { release = () => resolve({ status: 500, body: {} }); }) : undefined));
  t.after(async () => { release?.(); await api.close(); });
  const server = startServer(t, { MAILPROBE_API_KEY: 'mp_live_test', MAILPROBE_API_URL: api.url });

  server.send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'verify_emails', arguments: { emails: ['jane@example.com'] } } });
  while (api.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(await server.stop(), 0);
});

test('a cancelled call gets no response, and the next request is answered', { timeout: 20_000 }, async (t) => {
  let release;
  const api = await fakeApi((call) => (call.method === 'POST' ? new Promise((resolve) => { release = () => resolve({ status: 500, body: {} }); }) : undefined));
  t.after(async () => { release?.(); await api.close(); });
  const server = startServer(t, { MAILPROBE_API_KEY: 'mp_live_test', MAILPROBE_API_URL: api.url });

  server.send({ jsonrpc: '2.0', id: 'slow', method: 'tools/call', params: { name: 'verify_emails', arguments: { emails: ['jane@example.com'] } } });
  while (api.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 20));
  server.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'slow', reason: 'test' } });
  server.send({ jsonrpc: '2.0', id: 'next', method: 'ping' });
  assert.deepEqual(JSON.parse(await server.line()), { jsonrpc: '2.0', id: 'next', result: {} });
  assert.equal(await server.stop(), 0);
});

test('--version and --help print and exit', () => {
  assert.equal(execFileSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' }).trim(), version);
  assert.match(execFileSync(process.execPath, [BIN, '--help'], { encoding: 'utf8' }), /MAILPROBE_API_KEY/);
});
