#!/usr/bin/env node
import { main, version } from '../src/index.js';

const HELP = `mailprobe-mcp ${version}
MCP server of the MailProbe API. An MCP client starts it and talks to it over stdio:

  {
    "mcpServers": {
      "mailprobe": {
        "command": "npx",
        "args": ["-y", "mailprobe-mcp"],
        "env": { "MAILPROBE_API_KEY": "mp_live_..." }
      }
    }
  }

Documentation: https://github.com/jamalofski/mailprobe-mcp
`;

const argument = process.argv[2];
if (argument === '--version' || argument === '-v') {
  process.stdout.write(`${version}\n`);
} else if (argument === '--help' || argument === '-h') {
  process.stdout.write(HELP);
} else {
  await main();
}
