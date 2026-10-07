// A fake MailProbe API on a local port, and a way to drive the real server over stdio.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export const BIN = fileURLToPath(new URL('../bin/mailprobe-mcp.js', import.meta.url));

export const CREDITS = { credits: 87 };

/** The entry the fake API returns for an address: the fields of a real result that the tests read. */
export const entry = (email) => ({
  email,
  result: 'deliverable',
  status: 'valid',
  score: 95,
  catch_all: false,
  reason: null,
  retry_after: null,
  disposable: false,
  role_based: false,
  free_provider: false,
  did_you_mean: null,
});

/**
 * Starts a fake API. Every request is recorded in `calls`, with its JSON body.
 * `respond(call)` may return { status, body, headers } to answer a call itself, or
 * nothing to let the fake API succeed.
 */
export async function fakeApi(respond = () => undefined) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const call = { method: req.method, path: req.url, headers: req.headers };
    if (chunks.length > 0) call.json = JSON.parse(Buffer.concat(chunks).toString());
    calls.push(call);
    const custom = await respond(call, calls);
    if (custom) {
      res.writeHead(custom.status, { 'content-type': custom.text === undefined ? 'application/json' : 'text/html', ...custom.headers });
      res.end(custom.text === undefined ? JSON.stringify(custom.body ?? {}) : custom.text);
      return;
    }
    if (req.method === 'POST' && req.url === '/api/v1/verify') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(call.json.emails.map(entry)));
    } else if (req.method === 'GET' && req.url === '/api/v1/credits') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(CREDITS));
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"Not found"}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    calls,
    url: `http://127.0.0.1:${server.address().port}/api/v1`,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
  };
}

/**
 * Starts the real server as an MCP client does, and exchanges JSON-RPC lines with it.
 * `t` is the test context: the process is killed when the test ends, so that a failed
 * assertion never leaves the runner waiting for it.
 */
export function startServer(t, env = {}) {
  const child = spawn(process.execPath, [BIN], { env: { ...process.env, MAILPROBE_API_KEY: '', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { child.kill(); });
  const lines = [];
  const waiting = [];
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (waiting.length) waiting.shift()(line);
      else lines.push(line);
    }
  });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return {
    send: (message) => child.stdin.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`),
    /** The next line of stdout, as text. */
    line: () => (lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve) => waiting.push(resolve))),
    /** Closes the input, as a client does to stop the server, and resolves to the exit code. */
    stop: () => { child.stdin.end(); return exited; },
    exited,
  };
}
