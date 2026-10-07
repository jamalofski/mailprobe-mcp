# Changelog

## 1.1.0 (2026-10-08)

- Local MCP server, `npx -y mailprobe-mcp`, for the clients that start a server on the computer and cannot send a header to a remote one, such as Claude Desktop. It offers the two tools of the remote server of MailProbe, `verify_emails` and `get_credits`, with the same definitions and the same sentences on a refusal, and calls the MailProbe API with the key of the `MAILPROBE_API_KEY` environment variable.
- stdio transport, no dependency, protocol revisions 2026-07-28 and 2025-11-25 down to 2024-11-05.
- Waits for `Retry-After` when the API rate-limits the key, twice at most and for delays of 30 seconds or less.

## 1.0.0 (2026-10-08)

First release.

- Claude Code plugin for the MailProbe MCP server, `https://mailprobe.dev/mcp`: it connects Claude Code to the server and takes the API key as an option, kept in the credential store of the system.
- Skill that tells an assistant how to read a result of `verify_emails`, what a call costs, and how to go through a list.
- Marketplace file: Claude Code installs the plugin from this repository.
