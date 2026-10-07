// The names this repository gives to the MailProbe server and to its tools, read from
// the README and from the skill: the tests and check-tools compare them.

export const SERVER_URL = 'https://mailprobe.dev/mcp';

/** The tools of the README: the first cell of each row of its Tools table, in order. */
export function readmeTools(readme) {
  const [, section = ''] = readme.match(/^## Tools\r?\n([\s\S]*?)^## /m) ?? [];
  return [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1]);
}

/** The tools of the skill: the first cell of each row of the table of its "The two tools" section. */
export function namedTools(skill) {
  const [, section = ''] = skill.match(/^## The two tools\r?\n([\s\S]*?)^## /m) ?? [];
  return [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1]);
}
