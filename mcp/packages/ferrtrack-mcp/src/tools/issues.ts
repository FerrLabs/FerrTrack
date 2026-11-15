import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { trackRequest } from '../api-base.js';
import {
  dueDateSchema,
  estimateSchema,
  type Issue,
  parentIdSchema,
  prioritySchema,
} from './issue-model.js';

interface IssueFilters {
  status?: string;
  kind?: string;
  assignee_id?: string;
  limit?: number;
}

export async function fetchProjectIssues(
  projectSlug: string,
  filters: IssueFilters = {},
): Promise<Issue[]> {
  const token = await getToken();
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.assignee_id) params.set('assignee', filters.assignee_id);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return trackRequest<Issue[]>(`/projects/${encodeURIComponent(projectSlug)}/issues${qs}`, {
    token,
  });
}

function definedOnly(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

export function registerIssueTools(server: McpServer) {
  server.tool(
    'list_track_issues',
    'List FerrTrack issues in a project. Filter by status (open|in_progress|review|closed|all), kind (bug|feat|chore|docs), assignee, limit. Each issue includes priority, estimate, due_date, cycle_id and milestone_id.',
    {
      project_slug: z.string().min(1).describe('Project slug'),
      status: z
        .enum(['open', 'in_progress', 'review', 'closed', 'all'])
        .optional()
        .describe('Filter by issue status (default open).'),
      kind: z.enum(['bug', 'feat', 'chore', 'docs']).optional().describe('Filter by issue kind.'),
      assignee_id: z
        .string()
        .optional()
        .describe('Assignee UUID, or "me" for the authenticated user.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Max issues to return (default 50).'),
    },
    { readOnlyHint: true },
    async ({ project_slug, status, kind, assignee_id, limit }) => {
      const issues = await fetchProjectIssues(project_slug, { status, kind, assignee_id, limit });
      return {
        content: [{ type: 'text' as const, text: toToolText(issues) }],
      };
    },
  );

  server.tool(
    'create_issue',
    'Create a new FerrTrack issue in a project. Returns the new issue including its `ref` (e.g. "FT-12"). Optionally set priority, estimate, due_date and parent_id up front; cycle and milestone are attached afterwards with update_issue.',
    {
      project_slug: z.string().min(1).describe('Project slug'),
      title: z.string().min(1).max(200).describe('Issue title'),
      body: z.string().max(100_000).optional().describe('Issue body (markdown).'),
      kind: z
        .enum(['bug', 'feat', 'chore', 'docs'])
        .optional()
        .describe('Issue kind (default feat).'),
      labels: z.array(z.string()).optional().describe('Label strings to apply on creation.'),
      assignee_id: z.string().uuid().optional().describe('User UUID to assign on creation.'),
      priority: prioritySchema.optional(),
      estimate: estimateSchema.optional(),
      due_date: dueDateSchema.optional(),
      parent_id: parentIdSchema.optional(),
    },
    async ({
      project_slug,
      title,
      body,
      kind,
      labels,
      assignee_id,
      priority,
      estimate,
      due_date,
      parent_id,
    }) => {
      const token = await getToken();
      const issue = await trackRequest<Issue>(
        `/projects/${encodeURIComponent(project_slug)}/issues`,
        {
          token,
          method: 'POST',
          body: {
            title,
            body: body ?? '',
            kind: kind ?? 'feat',
            labels: labels ?? [],
            assignee_id: assignee_id ?? null,
            ...definedOnly({ priority, estimate, due_date, parent_id }),
          },
        },
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(issue) }],
      };
    },
  );

  server.tool(
    'update_issue',
    'Patch a FerrTrack issue: change title/body/status/kind/priority, edit labels, or set/clear assignee, cycle, milestone, estimate, due date and parent. Only fields you pass are touched; omit a field to leave it unchanged, pass null (where allowed) to clear it. Returns the updated issue.',
    {
      issue_ref: z.string().min(1).describe('Issue ref, e.g. "FT-12"'),
      title: z.string().min(1).max(200).optional(),
      body: z.string().max(100_000).optional(),
      status: z.enum(['open', 'in_progress', 'review', 'closed']).optional(),
      kind: z.enum(['bug', 'feat', 'chore', 'docs']).optional(),
      labels: z.array(z.string()).optional(),
      assignee_id: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe('User UUID; pass null to unassign.'),
      priority: prioritySchema.optional(),
      estimate: estimateSchema
        .nullable()
        .optional()
        .describe('Integer 0-1000 (e.g. story points); pass null to clear the estimate.'),
      due_date: dueDateSchema
        .nullable()
        .optional()
        .describe('Due date as YYYY-MM-DD; pass null to clear it.'),
      cycle_id: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe(
          "Cycle UUID (from list_cycles) to put the issue in; pass null to remove it from its cycle. The cycle must belong to the issue's project.",
        ),
      milestone_id: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe(
          "Milestone UUID (from list_milestones) to attach the issue to; pass null to detach it. The milestone must belong to the issue's project.",
        ),
      parent_id: parentIdSchema
        .nullable()
        .optional()
        .describe(
          'UUID (not the ref) of the parent issue to make this a sub-issue; pass null to detach it from its parent.',
        ),
    },
    async ({ issue_ref, ...patch }) => {
      const token = await getToken();
      const body = definedOnly(patch);
      const issue = await trackRequest<Issue>(`/issues/${encodeURIComponent(issue_ref)}`, {
        token,
        method: 'PATCH',
        body,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(issue) }],
      };
    },
  );

  server.tool(
    'list_issue_links',
    'List GitHub PR ↔ FerrTrack issue links for one issue (created by the GitHub webhook on push).',
    {
      issue_ref: z.string().min(1).describe('Issue ref, e.g. "FT-12"'),
    },
    { readOnlyHint: true },
    async ({ issue_ref }) => {
      const token = await getToken();
      const links = await trackRequest<unknown>(`/issues/${encodeURIComponent(issue_ref)}/links`, {
        token,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(links) }],
      };
    },
  );
}
