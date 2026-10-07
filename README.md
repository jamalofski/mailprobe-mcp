# mailprobe-mcp

Claude Code plugin and agent skill for the [MailProbe](https://mailprobe.dev/) MCP server. Your AI assistant checks whether email addresses exist and can receive mail, in real time and without sending anything: one address, or a list before a campaign. Verification runs on OVHcloud servers in France, and the API stores no address.

[Installation](#installation) · [Tools](#tools) · [How it behaves](#how-it-behaves) · [Development](#development)

MailProbe runs its [Model Context Protocol](https://modelcontextprotocol.io) server itself, at `https://mailprobe.dev/mcp`: there is nothing to install or to run on your computer. This repository holds what goes around it: the plugin that connects Claude Code to the server, and the skill that tells an assistant how to read a result and how to go through a list.

## Installation

1. Create an account on [mailprobe.dev](https://mailprobe.dev/). It comes with 100 free credits; see [pricing](https://mailprobe.dev/pricing/) for more.
2. Create an API key, which starts with `mp_live_`, under **Developer** in your account. MailProbe shows it only once, at creation.
3. Add the server to your MCP client, with the key in the `Authorization` header.

In Claude Code:

```bash
claude mcp add --transport http mailprobe https://mailprobe.dev/mcp --header "Authorization: Bearer mp_live_..."
```

In Cursor, in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mailprobe": {
      "url": "https://mailprobe.dev/mcp",
      "headers": { "Authorization": "Bearer mp_live_..." }
    }
  }
}
```

Any other client that connects to a remote MCP server and can send a header works the same way. The server has no OAuth sign-in yet, which the Claude and ChatGPT apps ask for: there, MailProbe is available through [Zapier MCP](https://zapier.com/apps/mailprobe/integrations).

Or, in Claude Code, install the plugin: the same server, with a skill that tells the assistant how to read a result, what a call costs, and how to go through a list.

```
/plugin marketplace add jamalofski/mailprobe-mcp
/plugin install mailprobe@mailprobe
```

Claude Code asks for the API key when the plugin is enabled, and keeps it in the credential store of the system, not in a settings file. To set it later, run `/plugin configure mailprobe@mailprobe`, or open `/plugin`, **Installed** tab, mailprobe, **Configure options**. A server you added by hand at the same address takes precedence over the one of the plugin.

Then ask for what you need: "does jane@example.com exist?", "check the addresses of contacts.csv before I send the newsletter", "which of these sign-ups are disposable?".

## Tools

| Tool | What it does |
|---|---|
| `verify_emails` | Verifies 1 to 20 addresses and returns one result per address, in the order given: `status` (`valid`, `invalid`, `risky` or `unknown`), a `score` from 0 to 100, the `reason` of a verdict that is not plainly deliverable, the `disposable`, `role_based`, `free_provider` and `catch_all` flags, and `did_you_mean` for a likely typo |
| `get_credits` | Returns the credits left on the account of the API key |

The fields of a result are those of the API: see the [API documentation](https://mailprobe.dev/api-docs/).

## How it behaves

- **Nothing is sent to the address.** MailProbe checks the syntax, the mail servers of the domain, then asks the mail server whether the mailbox exists, and stops there.
- **Nothing is stored.** An address verified through the API is processed in memory and gone when the response is sent. No result is reused for a later request.
- **Credits.** One credit per address actually probed, taken from your account as with the API. An address repeated in the same call, an entry that is not a well-formed address, an address that could not be probed in time and one whose server refused the connection cost nothing. `get_credits` is free.
- **Rate limit.** The server accepts 60 calls per minute for an API key, and a call of 20 addresses counts as one. A refused call gives the number of seconds to wait.
- **Response time.** A call answers within about 95 seconds, however slow the mail servers are. An address that could not be probed by then comes back `unknown` with the reason `timeout`, at no charge.
- **Long lists.** A call takes 20 addresses, so an assistant sends a list in several calls. Above a few hundred addresses, the batch screen of your account is the right tool: a pasted list of up to 500 addresses, or a CSV or TXT file of up to 250,000, verified in the background.
- **Errors.** A refusal comes back to the assistant as a sentence it can act on: the key to set, the credits to buy, the delay to wait.

## Development

This repository has no server code: the MCP server is part of MailProbe. `plugin/` holds the Claude Code plugin: its manifest, the `.mcp.json` that points at the server, and the skill, `plugin/skills/mailprobe/SKILL.md`. `.claude-plugin/marketplace.json` is the catalog that lets Claude Code install the plugin from this repository.

```bash
npm test
```

checks that the manifests, the skill and this README agree: the version, the address of the server, the tools they name. It needs no key and no network.

```bash
npm run check-tools
```

compares the tools this repository names with what the live server lists (`tools/list`), which it answers without a key.

```bash
claude plugin validate . --strict
claude --plugin-dir ./plugin
```

check the manifests, then start a session with the plugin loaded from the folder, without installing it.

### Releasing

1. Set the version in `package.json` and `plugin/.claude-plugin/plugin.json`, and date its section in `CHANGELOG.md`.
2. Run `npm test` and `npm run check-tools`.
3. Commit and push: a user gets a change of the plugin or of the skill when the version changes.

## Resources

- [MailProbe API documentation](https://mailprobe.dev/api-docs/)
- [MCP setup on mailprobe.dev](https://mailprobe.dev/api-docs/#mcp)
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2026-07-28)

## Support

Open an [issue](https://github.com/jamalofski/mailprobe-mcp/issues) or write to contact@mailprobe.dev.

## License

MIT, see [LICENSE](LICENSE).
