# FerrTrack MCP

FerrTrack as Model Context Protocol server, so an AI assistant can drive it.

[![npm @ferrtrack/mcp](https://img.shields.io/npm/v/@ferrtrack/mcp)](https://www.npmjs.com/package/@ferrtrack/mcp)

## Quick start

Add to your MCP client configuration (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "ferrtrack": { "command": "npx", "args": ["-y", "@ferrtrack/mcp"] }
  }
}
```

The first tool call that needs auth opens a browser for an OAuth loopback flow and saves the token. To skip it (CI, headless), set `FERRLABS_API_TOKEN`. Details in the [FerrLabs MCP README](https://github.com/FerrLabs/FerrLabs/blob/main/packages/mcp/README.md#how-auth-resolution-works).

## Tools

Tools marked **destructive** are irreversible or high-impact. MCP clients should gate them behind a confirmation.

### `@ferrtrack/mcp`

| Tool                                                                                                  | Notes                                     |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `list_track_projects`, `get_project`, `create_project`, `update_project`                              | projects                                  |
| `list_track_issues`, `get_issue`, `create_issue`, `update_issue`, `list_issue_links`                  | issues                                    |
| `list_issue_comments`, `create_issue_comment`, `update_issue_comment`, `delete_issue_comment`         | `delete_issue_comment` is **destructive** |
| `list_cycles`, `create_cycle`, `update_cycle`, `delete_cycle`, `list_cycle_issues`, `plan_next_cycle` | `delete_cycle` is **destructive**         |
| `list_milestones`, `create_milestone`, `update_milestone`, `delete_milestone`                         | `delete_milestone` is **destructive**     |
| `list_track_users`, `search_track`                                                                    | read                                      |

## Resources and prompts

| Kind     | Name                                | What it does                                                                                                  |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Resource | `ferrtrack://project/{slug}/issues` | open issues in one project; projects enumerate themselves, so a client can browse them                        |
| Prompt   | `triage_backlog`                    | walks a project's open issues and proposes a decision per issue, grouped by action, without applying anything |

## Configuration

| Variable                | Description                                                             | Default                     |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------- |
| `FERRTRACK_API_URL`     | Base URL for the FerrTrack API (`@ferrtrack/mcp`).                      | `https://api.ferrtrack.com` |
| `FERRTRACK_API_VERSION` | Contract version sent as `x-ferrtrack-api-version` by `@ferrtrack/mcp`. | `2026-08-04`                |

Shared variables (token, OAuth, host allowlist, HTTP transport, output cap) are read by [`@ferrlabs/mcp-core`](https://github.com/FerrLabs/FerrLabs/tree/main/packages/mcp-core) and documented in the [FerrLabs MCP README](https://github.com/FerrLabs/FerrLabs/blob/main/packages/mcp/README.md#configuration).

## Development

```bash
cd mcp
pnpm install
pnpm build
pnpm test
pnpm smoke
```

`pnpm smoke` boots each server over stdio and checks the handshake and the advertised tools.

## License

Mozilla Public License 2.0, see [LICENSE](../LICENSE).
