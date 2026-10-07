// The address of the remote MailProbe server, and the tools the README and the skill name:
// the tests compare them with the tools of this package.

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
