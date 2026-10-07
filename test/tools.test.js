// The tools, in process, against a fake MailProbe API.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClient } from '../src/api.js';
import { MAX_EMAILS, createTools } from '../src/tools.js';
import { CREDITS, entry, fakeApi } from './helpers.js';

/** The tools wired to a fake API, with waits that do not wait. */
async function setup({ respond, hasKey = true } = {}) {
  const api = await fakeApi(respond);
  const waits = [];
  const client = createClient({
    apiKey: 'mp_live_test',
    baseUrl: api.url,
    userAgent: 'mailprobe-mcp/test',
    wait: async (ms) => { waits.push(ms); },
  });
  const { tools, callTool } = createTools({ api: client, hasKey });
  return {
    api,
    waits,
    tools,
    call: (name, args, signal = new AbortController().signal) => callTool(name, args, { signal }),
    close: () => api.close(),
  };
}

const text = (result) => result.content[0].text;
const verifications = (api) => api.calls.filter((call) => call.method === 'POST');

test('verify_emails sends the addresses as they are and returns one result per address, in order', async () => {
  const t = await setup();
  try {
    const emails = ['Jane@Example.com', 'info@example.org', 'jane@example.com'];
    const result = await t.call('verify_emails', { emails });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, { results: emails.map(entry) });
    assert.deepEqual(JSON.parse(text(result)), result.structuredContent);
    const [call] = t.api.calls;
    assert.equal(`${call.method} ${call.path}`, 'POST /api/v1/verify');
    assert.deepEqual(call.json, { emails });
    assert.equal(call.headers.authorization, 'Bearer mp_live_test');
    assert.equal(call.headers['user-agent'], 'mailprobe-mcp/test');
    assert.equal(call.headers['content-type'], 'application/json');
  } finally {
    await t.close();
  }
});

test('get_credits returns the balance of the account', async () => {
  const t = await setup();
  try {
    const result = await t.call('get_credits', {});
    assert.deepEqual(result.structuredContent, CREDITS);
    assert.deepEqual(t.api.calls.map((call) => `${call.method} ${call.path}`), ['GET /api/v1/credits']);
    assert.equal(t.api.calls[0].headers['content-type'], undefined);
  } finally {
    await t.close();
  }
});

test('arguments the API would refuse are refused here, and the API is not called', async () => {
  const t = await setup();
  try {
    const cases = [
      [{}, /^Provide "emails": an array of 1 to 20 email addresses\.$/],
      [{ emails: [] }, /^Provide "emails"/],
      [{ emails: 'jane@example.com' }, /^Provide "emails"/],
      [{ emails: Array.from({ length: MAX_EMAILS + 1 }, (_, n) => `a${n}@example.com`) }, /^Too many addresses: 21 received, 20 at most per call\. Split the list into several calls\.$/],
      [{ emails: ['jane@example.com', 42] }, /^Every entry of "emails" must be a string\.$/],
    ];
    for (const [args, expected] of cases) {
      const result = await t.call('verify_emails', args);
      assert.equal(result.isError, true);
      assert.match(text(result), expected);
    }
    assert.equal(t.api.calls.length, 0);
  } finally {
    await t.close();
  }
});

test('twenty addresses go through in one call', async () => {
  const t = await setup();
  try {
    const emails = Array.from({ length: MAX_EMAILS }, (_, n) => `a${n}@example.com`);
    const result = await t.call('verify_emails', { emails });
    assert.equal(result.structuredContent.results.length, MAX_EMAILS);
    assert.equal(verifications(t.api).length, 1);
  } finally {
    await t.close();
  }
});

test('a refusal of the API becomes a tool error the model can act on', async () => {
  const cases = [
    [401, { error: 'Invalid or missing API key', code: 'UNAUTHORIZED' }, /^MailProbe did not accept the API key\. Check MAILPROBE_API_KEY.*dashboard\/#\/developer$/],
    [402, { error: 'Insufficient credits. Need 3, have 1', code: 'NO_CREDITS' }, /^Insufficient credits\. Need 3, have 1\. Nothing was charged\. Credits are bought at https:\/\/mailprobe\.dev\/pricing\/$/],
    [402, { error: 'Addresses at example.com can only be verified with purchased credits: free credits and the free verifier do not cover this domain.', code: 'PAID_ONLY_DOMAIN' }, /^Addresses at example\.com can only be verified.*this domain\. Nothing was charged\.$/],
    [400, { error: 'Maximum 20 emails per request. For longer lists, use the batch screen in your dashboard.', code: 'TOO_MANY' }, /^Maximum 20 emails per request\./],
    [413, { error: 'Payload too large' }, /^Payload too large$/],
    [500, { error: 'Verification failed', code: 'INTERNAL_ERROR' }, /^MailProbe could not complete the verification\. Nothing was charged: try again in a moment\.$/],
    [502, {}, /^MailProbe could not complete this call\. Try again in a moment\.$/],
    [404, {}, /^MailProbe could not complete this call\./],
  ];
  for (const [status, body, expected] of cases) {
    const t = await setup({ respond: () => ({ status, body }) });
    try {
      const result = await t.call('verify_emails', { emails: ['jane@example.com'] });
      assert.equal(result.isError, true, `${status} ${body.code}`);
      assert.match(text(result), expected, `${status} ${body.code}`);
      assert.equal(verifications(t.api).length, 1, `${status} ${body.code}`);
    } finally {
      await t.close();
    }
  }
});

test('an answer that is not the JSON of the API is reported, not passed on', async () => {
  const cases = [
    ['verify_emails', { emails: ['jane@example.com'] }, { status: 200, body: { unexpected: true } }],
    ['verify_emails', { emails: ['jane@example.com'] }, { status: 200, text: '<html>a proxy page</html>' }],
    ['get_credits', {}, { status: 200, body: { credits: '87' } }],
    ['get_credits', {}, { status: 502, text: '<html>502 Bad Gateway</html>' }],
  ];
  for (const [name, args, answer] of cases) {
    const t = await setup({ respond: () => answer });
    try {
      const result = await t.call(name, args);
      assert.equal(result.isError, true);
      assert.equal(text(result), 'MailProbe could not complete this call. Try again in a moment.');
    } finally {
      await t.close();
    }
  }
});

test('a rate limit with a short delay is waited out, then the verification goes through', async () => {
  let refusals = 2;
  const t = await setup({
    respond: (call) => (call.method === 'POST' && refusals-- > 0
      ? { status: 429, body: { error: 'Rate limit exceeded. Max 60 requests per minute.', code: 'RATE_LIMITED' }, headers: { 'retry-after': '3' } }
      : undefined),
  });
  try {
    const result = await t.call('verify_emails', { emails: ['jane@example.com'] });
    assert.equal(result.isError, undefined);
    assert.deepEqual(t.waits, [3000, 3000]);
    // The same addresses are sent again at each attempt.
    assert.deepEqual(verifications(t.api).map((call) => call.json.emails), [['jane@example.com'], ['jane@example.com'], ['jane@example.com']]);
  } finally {
    await t.close();
  }
});

test('a rate limit that lasts is retried twice, then reported with the delay', async () => {
  const t = await setup({
    respond: () => ({ status: 429, body: { error: 'Rate limit exceeded. Max 60 requests per minute.', code: 'RATE_LIMITED' }, headers: { 'retry-after': '1' } }),
  });
  try {
    const result = await t.call('verify_emails', { emails: ['jane@example.com'] });
    assert.equal(result.isError, true);
    assert.equal(text(result), 'Rate limit exceeded. Max 60 requests per minute. Retry in 1 second.');
    assert.equal(verifications(t.api).length, 3);
  } finally {
    await t.close();
  }
});

test('a long rate limit is not waited out: the delay goes to the model', async () => {
  for (const [headers, delay] of [[{ 'retry-after': '55' }, 55], [{}, 60]]) {
    const t = await setup({ respond: () => ({ status: 429, body: { error: 'Rate limit exceeded.', code: 'RATE_LIMITED' }, headers }) });
    try {
      const result = await t.call('get_credits', {});
      assert.equal(text(result), `Rate limit exceeded. Retry in ${delay} seconds.`);
      assert.deepEqual(t.waits, []);
      assert.equal(t.api.calls.length, 1);
    } finally {
      await t.close();
    }
  }
});

test('a lack of credits is never retried', async () => {
  const t = await setup({
    respond: () => ({ status: 402, body: { error: 'Insufficient credits. Need 1, have 0', code: 'NO_CREDITS' }, headers: { 'retry-after': '1' } }),
  });
  try {
    await t.call('verify_emails', { emails: ['jane@example.com'] });
    assert.equal(verifications(t.api).length, 1);
    assert.deepEqual(t.waits, []);
  } finally {
    await t.close();
  }
});

test('without an API key the API is not called', async () => {
  const t = await setup({ hasKey: false });
  try {
    for (const [name, args] of [['verify_emails', { emails: ['jane@example.com'] }], ['get_credits', {}]]) {
      const result = await t.call(name, args);
      assert.equal(result.isError, true);
      assert.match(text(result), /^No MailProbe API key\. Set the MAILPROBE_API_KEY environment variable/);
    }
    assert.equal(t.api.calls.length, 0);
  } finally {
    await t.close();
  }
});

test('an unreachable API is reported as such', async () => {
  const client = createClient({ apiKey: 'k', baseUrl: 'http://127.0.0.1:9/api/v1', userAgent: 'test' });
  const { callTool } = createTools({ api: client, hasKey: true });
  const result = await callTool('get_credits', {}, { signal: new AbortController().signal });
  assert.equal(result.isError, true);
  assert.match(text(result), /^Could not reach MailProbe\./);
});

test('a cancelled call throws, so that nothing is sent back', { timeout: 10_000 }, async () => {
  let release;
  const t = await setup({
    respond: (call) => (call.method === 'POST' ? new Promise((resolve) => { release = () => resolve({ status: 500, body: {} }); }) : undefined),
  });
  try {
    const controller = new AbortController();
    const pending = t.call('verify_emails', { emails: ['jane@example.com'] }, controller.signal);
    while (t.api.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await assert.rejects(pending);
  } finally {
    release?.();
    await t.close();
  }
});

test('the tools describe themselves the way a client expects', async () => {
  const t = await setup();
  try {
    assert.deepEqual(t.tools.map((tool) => tool.name), ['verify_emails', 'get_credits']);
    for (const tool of t.tools) {
      assert.equal(tool.annotations.title, tool.title);
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.inputSchema.type, 'object');
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
    assert.equal(t.tools[0].inputSchema.properties.emails.maxItems, MAX_EMAILS);
  } finally {
    await t.close();
  }
});
