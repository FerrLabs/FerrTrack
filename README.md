<div align="center">

<h1><img src=".github/logo.svg" alt="" height="40" align="center"> FerrTrack</h1>

**Manage FerrTrack issues, cycles and projects from an AI assistant.**

MCP server for [FerrTrack](https://ferrlabs.com), the issue tracker.

[![npm @ferrtrack/mcp](https://img.shields.io/npm/v/@ferrtrack/mcp)](https://www.npmjs.com/package/@ferrtrack/mcp)
[![CI](https://github.com/FerrLabs/FerrTrack/actions/workflows/ci.yml/badge.svg)](https://github.com/FerrLabs/FerrTrack/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/FerrLabs/FerrTrack)](LICENSE)

[MCP server](mcp/README.md) | [npm](https://www.npmjs.com/package/@ferrtrack/mcp) | [FerrLabs](https://ferrlabs.com)

</div>

## What is in this repository

This repository holds the open source parts of FerrTrack. For now that is the MCP server in [`mcp/`](mcp), published to npm as [`@ferrtrack/mcp`](https://www.npmjs.com/package/@ferrtrack/mcp). The product itself lives in [FerrTrack-Cloud](https://github.com/FerrLabs/FerrTrack-Cloud).

## MCP server

Tools cover projects, issues and their links, comments, cycles (including `plan_next_cycle`), milestones, users and search. Deletions are marked destructive so clients can ask for confirmation. A `triage_backlog` prompt walks a project's open issues and proposes a decision per issue without applying anything, and the `ferrtrack://project/{slug}/issues` resource exposes a project's open issues.

### Install

Add it to your MCP client configuration (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "ferrtrack": { "command": "npx", "args": ["-y", "@ferrtrack/mcp"] }
  }
}
```

The first tool call that needs auth opens a browser for an OAuth loopback flow and saves the token. To skip it (CI, headless), set `FERRLABS_API_TOKEN`.

### Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `FERRTRACK_API_URL` | Base URL of the FerrTrack API. | `https://api.ferrtrack.com` |
| `FERRTRACK_API_VERSION` | Contract version sent as `x-ferrtrack-api-version`. | `2026-08-04` |

The full tool list, resources, prompts and the shared variables (token, OAuth, host allowlist, HTTP transport, output cap) are documented in [`mcp/README.md`](mcp/README.md) and the [FerrLabs MCP README](https://github.com/FerrLabs/FerrLabs/blob/main/packages/mcp/README.md#configuration).

## Development

Node 22 or later and pnpm 12.

```bash
cd mcp
pnpm install
pnpm build
pnpm test
pnpm smoke
```

`pnpm smoke` boots the server over stdio and checks the handshake and the advertised tools.

## License

Mozilla Public License 2.0, see [LICENSE](LICENSE).
