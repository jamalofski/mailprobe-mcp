// What the npm package, the plugin, the skill, the marketplace file and the README must agree on.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { SERVER_URL, namedTools, readmeTools } from '../scripts/names.mjs';
import { TOOLS } from '../src/tools.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const plugin = require('../plugin/.claude-plugin/plugin.json');
const marketplace = require('../.claude-plugin/marketplace.json');
const pluginServers = require('../plugin/.mcp.json');

const read = (file) => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('the changelog has a section for this version, and the package ships what it runs', async () => {
  assert.match(await read('CHANGELOG.md'), new RegExp(`^## ${pkg.version.replaceAll('.', '\\.')} `, 'm'));
  assert.deepEqual(pkg.files, ['bin', 'src']);
  assert.equal(pkg.bin['mailprobe-mcp'], 'bin/mailprobe-mcp.js');
  assert.equal(pkg.dependencies, undefined);
});

test('the plugin is at the version of the package, and the marketplace of this repository lists it', () => {
  assert.equal(plugin.version, pkg.version);
  assert.equal(marketplace.plugins.length, 1);
  const [listed] = marketplace.plugins;
  assert.equal(listed.name, plugin.name);
  assert.equal(listed.source, './plugin');
  // Claude Code reads the version of plugin.json first: it is written there only.
  assert.equal(listed.version, undefined);
});

test('the plugin points at the remote MailProbe server, with the API key of its option', () => {
  const server = pluginServers.mcpServers.mailprobe;
  assert.equal(server.type, 'http');
  // The address of the README: Claude Code then keeps one server when the user added it by hand too.
  assert.equal(server.url, SERVER_URL);
  assert.deepEqual(server.headers, { Authorization: 'Bearer ${user_config.api_key}' });
  // Sensitive: the key goes to the credential store of the system, not to a settings file.
  assert.equal(plugin.userConfig.api_key.sensitive, true);
});

test('the README gives the address the plugin uses, and the command that starts this package', async () => {
  const readme = await read('README.md');
  assert.ok(readme.includes(`claude mcp add --transport http mailprobe ${SERVER_URL} `));
  assert.ok(readme.includes(`"url": "${SERVER_URL}"`));
  assert.ok(readme.includes(`"args": ["-y", "${pkg.name}"]`));
});

test('the README and the skill name the tools of the server, and no other', async () => {
  const tools = TOOLS.map((tool) => tool.name);
  assert.deepEqual(readmeTools(await read('README.md')), tools);
  assert.deepEqual(namedTools(await read('plugin/skills/mailprobe/SKILL.md')), tools);
});

test('the skill has the front matter the Agent Skills format asks for', async () => {
  const skill = await read('plugin/skills/mailprobe/SKILL.md');
  const [, frontMatter] = skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const field = (name) => frontMatter.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1].trim();
  // The name is the one of the folder of the skill.
  assert.equal(field('name'), 'mailprobe');
  assert.ok(field('description').length <= 1024, `description is ${field('description').length} characters long`);
  assert.ok(field('compatibility').length <= 500);
});
