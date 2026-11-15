import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { trackRequest } from '../api-base.js';
import type { Issue } from './issue-model.js';

export function registerIssueDetailsTool(server: McpServer) {
  server.tool(
    'get_issue',
    'Get the full content of a FerrTrack issue by its ref (e.g. "FT-12") — title, body, status, kind, priority, estimate, due date, labels, assignee, and the cycle_id, milestone_id and parent_id it belongs to.',
    {
      issue_ref: z.string().min(1).describe('Issue ref, e.g. "FT-12"'),
    },
    { readOnlyHint: true },
    async ({ issue_ref }) => {
      const token = await getToken();
      const issue = await trackRequest<Issue>(`/issues/${encodeURIComponent(issue_ref)}`, {
        token,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(issue) }],
      };
    },
  );
}
