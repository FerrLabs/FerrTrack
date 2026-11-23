import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { trackRequest, trackRequestWithHeaders } from '../api-base.js';
import { withDeleteErrors } from './delete-errors.js';
import { buildIssuePage, type IssuePage, parseTotalCount } from './issue-page.js';
import {
  dueDateSchema,
  estimateSchema,
  type Issue,
  parentIdSchema,
  prioritySchema,
} from './issue-model.js';

type IssueStatusFilter = 'open' | 'in_progress' | 'review' | 'closed' | 'all';

interface IssueFilters {
  status?: IssueStatusFilter;
  kind?: string;
  assignee_id?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;
const API_MAX_LIMIT = 200;

export async function listProjectIssues(
  projectSlug: string,
  filters: IssueFilters = {},
): Promise<IssuePage> {
  const token = await getToken();
  const limit = filters.limit ?? DEFAULT_LIMIT;
  const offset = filters.offset ?? 0;
  const fetchRows = async (rowOffset: number, rowLimit: number) => {
    const params = new URLSearchParams({
      project: projectSlug,
      status: filters.status ?? 'open',
      limit: String(rowLimit),
      offset: String(rowOffset),
    });
    if (filters.kind) params.set('kind', filters.kind);
    if (filters.assignee_id) params.set('assignee', filters.assignee_id);
    return trackRequestWithHeaders<Issue[]>(`/issues?${params.toString()}`, { token });
  };

  const first = await fetchRows(offset, Math.min(limit + 1, API_MAX_LIMIT));
  const items = first.data;
  const needsProbe = limit >= API_MAX_LIMIT && items.length === API_MAX_LIMIT;
  const probe = needsProbe ? (await fetchRows(offset + API_MAX_LIMIT, 1)).data : [];
  return buildIssuePage({
    items: [...items, ...probe],
    offset,
    limit,
    total: parseTotalCount(first.headers.get('x-total-count')),
  });
}

function definedOnly(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

export function registerIssueTools(server: McpServer) {
  server.tool(
    'list_track_issues',
    'List FerrTrack issues in a project as compact rows (ref, title, status, assignee_id, priority, updated_at; use get_issue for the rest). Defaults to open issues, which excludes closed ones: pass status=closed or status=all to see them. Filter by status (open|in_progress|review|closed|all), kind (bug|feat|chore|docs), assignee. Results are paged: when has_more is true, call again with offset=next_offset. `total` is the number of issues matching the filters across all pages, when the API reports it. A page is cut to fit the response size limit and says so in `notice`.',
    {
      project_slug: z.string().min(1).describe('Project slug'),
      status: z
        .enum(['open', 'in_progress', 'review', 'closed', 'all'])
        .optional()
        .describe('Filter by issue status (default open: closed issues are excluded).'),
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
        .describe('Max issues per page (default 50).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Issues to skip (default 0). Pass next_offset from the previous page.'),
    },
    { readOnlyHint: true },
    async ({ project_slug, status, kind, assignee_id, limit, offset }) => {
      const page = await listProjectIssues(project_slug, {
        status,
        kind,
        assignee_id,
        limit,
        offset,
      });
      return {
        content: [{ type: 'text' as const, text: toToolText(page) }],
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

  server.tool(
    'delete_issue',
    'Permanently delete a FerrTrack issue and everything attached to it. This cannot be undone and is not the same as closing or archiving. Only organization owners and admins authenticated as a user can do it; organization tokens and connected apps are always refused.',
    {
      issue_ref: z.string().min(1).describe('Issue ref, e.g. "FT-12"'),
    },
    { destructiveHint: true },
    async ({ issue_ref }) => {
      const token = await getToken();
      await withDeleteErrors(() =>
        trackRequest<void>(`/issues/${encodeURIComponent(issue_ref)}/permanent`, {
          token,
          method: 'DELETE',
        }),
      );
      return {
        content: [{ type: 'text' as const, text: `Issue ${issue_ref} permanently deleted.` }],
      };
    },
  );
}
