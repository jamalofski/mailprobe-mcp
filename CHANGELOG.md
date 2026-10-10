# Changelog

## 1.1.1 (2026-10-10)

- The local server answers a tool call within about 55 seconds, like the remote one. MCP clients give up on a tool call after a minute, and a call they cancelled returned nothing while the verdicts already in were charged. The server now asks the API to answer in that time, with its `timeout` parameter: an address that has no verdict yet comes back `unknown` with the reason `timeout`, at no charge.
- A wait for the rate limit counts in those 55 seconds: the server no longer waits when the wait would leave no time to verify, and gives the delay to the assistant.
- Skill: a call answers within about 55 seconds, and a `timeout` is charged when the mail servers of the domain were all tried and stayed silent.

## 1.1.0 (2026-10-08)

- Local MCP server, `npx -y mailprobe-mcp`, for the clients that start a server on the computer and cannot send a header to a remote one, such as Claude Desktop. It offers the two tools of the remote server of MailProbe, `verify_emails` and `get_credits`, with the same definitions and the same sentences on a refusal, and calls the MailProbe API with the key of the `MAILPROBE_API_KEY` environment variable.
- stdio transport, no dependency, protocol revisions 2026-07-28 and 2025-11-25 down to 2024-11-05.
- Waits for `Retry-After` when the API rate-limits the key, twice at most and for delays of 30 seconds or less.

## 1.0.0 (2026-10-08)

First release.

- Claude Code plugin for the MailProbe MCP server, `https://mailprobe.dev/mcp`: it connects Claude Code to the server and takes the API key as an option, kept in the credential store of the system.
- Skill that tells an assistant how to read a result of `verify_emails`, what a call costs, and how to go through a list.
- Marketplace file: Claude Code installs the plugin from this repository.
