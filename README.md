# mailprobe-mcp

Official [Model Context Protocol](https://modelcontextprotocol.io) server of the [MailProbe API](https://mailprobe.dev/api-docs/). Your AI assistant checks whether email addresses exist and can receive mail, in real time and without sending anything: one address, or a list before a campaign. Verification runs on OVHcloud servers in France, and the API stores no address.

[Installation](#installation) · [Tools](#tools) · [How it behaves](#how-it-behaves) · [Development](#development)

There are two ways to reach it, with the same two tools:

- the **remote server** that MailProbe runs at `https://mailprobe.dev/mcp`, for a client that connects to a remote server and can send a header: nothing to install;
- the **local server** of this package, `npx -y mailprobe-mcp`, for a client that starts its servers on your computer.

This repository also holds the Claude Code plugin and the skill that tells an assistant how to read a result and how to go through a list.

## Installation

1. Create an account on [mailprobe.dev](https://mailprobe.dev/). It comes with 100 free credits; see [pricing](https://mailprobe.dev/pricing/) for more.
2. Create an API key, which starts with `mp_live_`, under **Developer** in your account. MailProbe shows it only once, at creation.
3. Add one of the two servers to your MCP client.

### Remote server

The key goes in the `Authorization` header. In Claude Code:

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

Any other client that connects to a remote MCP server and can send a header works the same way.

### Local server

The key goes in the `MAILPROBE_API_KEY` environment variable, and the server needs [Node.js](https://nodejs.org) 22 or later. In Claude Desktop and the other clients configured with a JSON file:

```json
{
  "mcpServers": {
    "mailprobe": {
      "command": "npx",
      "args": ["-y", "mailprobe-mcp"],
      "env": { "MAILPROBE_API_KEY": "mp_live_..." }
    }
  }
}
```

The Claude and ChatGPT apps connect to a remote server only through an OAuth sign-in, which MailProbe does not offer yet. Claude Desktop takes the local server above; elsewhere, MailProbe is available through [Zapier MCP](https://zapier.com/apps/mailprobe/integrations).

### Claude Code plugin

The plugin connects Claude Code to the remote server and adds a skill that tells the assistant how to read a result, what a call costs, and how to go through a list.

```
/plugin marketplace add jamalofski/mailprobe-mcp
/plugin install mailprobe@mailprobe
```

Claude Code asks for the API key when the plugin is enabled, and keeps it in the credential store of the system, not in a settings file. To set it later, run `/plugin configure mailprobe@mailprobe`, or open `/plugin`, **Installed** tab, mailprobe, **Configure options**. A remote server you added by hand at the same address takes precedence over the one of the plugin.

For another agent that loads `SKILL.md` skills, add one of the two servers above and take the skill alone: [`plugin/skills/mailprobe/SKILL.md`](plugin/skills/mailprobe/SKILL.md) in this repository, also listed on [Agensi](https://www.agensi.io/skills/mailprobe-verify-email-addresses-from-your-agent).

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
- **The same tools on both servers.** The local server carries the instructions and the tool definitions of the remote one, word for word, and words a refusal the same way. It adds nothing between the assistant and the API: it sends the addresses to `https://mailprobe.dev/api/v1` and returns the answer.
- **Credits.** One credit per address actually probed, taken from your account as with the API. An address repeated in the same call, an entry that is not a well-formed address, an address that could not be probed in time and one whose server refused the connection cost nothing. `get_credits` is free.
- **Rate limit.** The API accepts 60 calls per minute for an API key, and a call of 20 addresses counts as one. A refused call gives the number of seconds to wait. The local server waits by itself and tries again, twice at most and only for delays of 30 seconds or less; otherwise the assistant gets the delay to wait.
- **Response time.** A call answers within about 95 seconds, however slow the mail servers are. An address that could not be probed by then comes back `unknown` with the reason `timeout`, at no charge.
- **Long lists.** A call takes 20 addresses, so an assistant sends a list in several calls. Above a few hundred addresses, the batch screen of your account is the right tool: a pasted list of up to 500 addresses, or a CSV or TXT file of up to 250,000, verified in the background.
- **Errors.** A refusal comes back to the assistant as a sentence it can act on: the key to set, the credits to buy, the delay to wait.
- **Without a key.** The local server starts and lists its tools; a call explains how to set `MAILPROBE_API_KEY`.

Every request of the local server carries `User-Agent: mailprobe-mcp/<version>`. Mention it when you contact support: it tells your calls apart in the API's logs.

## Development

The local server has no dependency: Node.js runs the sources as they are. It talks to its client over stdio and serves both eras of the protocol from the same process: revision 2026-07-28, where each request carries its protocol version, and the earlier revisions (2025-11-25 down to 2024-11-05), which start with an `initialize` handshake.

```bash
npm test
```

runs the tests against a fake MailProbe API on a local port: no key and no network are needed. They also check that the package, the plugin, the skill and this README agree.

```bash
npm run check-tools
```

compares the instructions and the tool definitions of this package with those of the remote server, which gives them without a key.

### Plugin

`plugin/` holds the Claude Code plugin: its manifest, the `.mcp.json` that points at the remote server, and the skill, `plugin/skills/mailprobe/SKILL.md`. `.claude-plugin/marketplace.json` is the catalog that lets Claude Code install the plugin from this repository. Neither is part of the npm package.

```bash
claude plugin validate . --strict
claude --plugin-dir ./plugin
```

check the manifests, then start a session with the plugin loaded from the folder, without installing it. A user gets a change of the plugin or of the skill when the version changes: it ships with a release.

### Releasing

1. Set the version in `package.json` and `plugin/.claude-plugin/plugin.json`, and date its section in `CHANGELOG.md`.
2. Run `npm test` and `npm run check-tools`.
3. Commit, then push a tag named after the version: the **Publish** workflow publishes the package to npm through Trusted Publishing, with a provenance statement.
4. When the skill changed, upload it again to its [Agensi listing](https://www.agensi.io/skills/mailprobe-verify-email-addresses-from-your-agent), as a new version: a ZIP of a `mailprobe/` folder that holds the `SKILL.md`. Nothing updates the listing from this repository.

## Resources

- [MailProbe API documentation](https://mailprobe.dev/api-docs/)
- [MCP setup on mailprobe.dev](https://mailprobe.dev/api-docs/#mcp)
- [MailProbe skill on Agensi](https://www.agensi.io/skills/mailprobe-verify-email-addresses-from-your-agent)
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2026-07-28)

## Support

Open an [issue](https://github.com/jamalofski/mailprobe-mcp/issues) or write to contact@mailprobe.dev.

## License

MIT, see [LICENSE](LICENSE).
