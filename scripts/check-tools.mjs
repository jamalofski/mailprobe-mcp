// Compares the tools the README and the skill name with what the live MailProbe server
// lists. `tools/list` needs no API key: the server answers it to anyone.
import fs from 'node:fs/promises';

import { SERVER_URL, namedTools, readmeTools } from './names.mjs';

const read = (file) => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');

const response = await fetch(SERVER_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  console.error(`${SERVER_URL} answered HTTP ${response.status}`);
  process.exit(1);
}
const live = (await response.json()).result.tools.map((tool) => tool.name);

let failed = false;
for (const [where, named] of [
  ['README.md', readmeTools(await read('README.md'))],
  ['the skill', namedTools(await read('plugin/skills/mailprobe/SKILL.md'))],
]) {
  const missing = live.filter((name) => !named.includes(name));
  const unknown = named.filter((name) => !live.includes(name));
  if (missing.length > 0) console.error(`${where} does not name: ${missing.join(', ')}`);
  if (unknown.length > 0) console.error(`${where} names tools the server does not have: ${unknown.join(', ')}`);
  failed ||= missing.length > 0 || unknown.length > 0;
}
if (failed) process.exit(1);
console.log(`The README and the skill name the ${live.length} tools of the server: ${live.join(', ')}`);
