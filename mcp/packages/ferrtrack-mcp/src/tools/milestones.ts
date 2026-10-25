import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { trackRequest } from '../api-base.js';

interface Milestone {
  id: string;
  project_id: string;
  name: string;
  summary: string | null;
  target_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function registerMilestoneTools(server: McpServer) {
  server.tool(
    'list_milestones',
    'List milestones for a FerrTrack project.',
    {
      project_slug: z.string().min(1).describe('Project slug'),
    },
    async ({ project_slug }) => {
      const token = await getToken();
      const milestones = await trackRequest<Milestone[]>(
        `/projects/${encodeURIComponent(project_slug)}/milestones`,
        { token },
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(milestones) }],
      };
    },
  );

  server.tool(
    'create_milestone',
    'Create a milestone on a project. Target date is optional.',
    {
      project_slug: z.string().min(1).describe('Project slug'),
      name: z.string().min(1).max(100),
      summary: z.string().max(2000).optional(),
      target_date: z.iso.date().optional().describe('ISO date (YYYY-MM-DD).'),
    },
    async ({ project_slug, name, summary, target_date }) => {
      const token = await getToken();
      const milestone = await trackRequest<Milestone>(
        `/projects/${encodeURIComponent(project_slug)}/milestones`,
        {
          token,
          method: 'POST',
          body: {
            name,
            summary: summary ?? null,
            target_date: target_date ?? null,
          },
        },
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(milestone) }],
      };
    },
  );

  server.tool(
    'update_milestone',
    'Patch a milestone — rename, edit summary, shift target date, flip status.',
    {
      milestone_id: z.string().min(1).describe('Milestone id'),
      name: z.string().min(1).max(100).optional(),
      summary: z.string().max(2000).nullable().optional(),
      target_date: z.iso.date().nullable().optional(),
      status: z.enum(['planned', 'in_progress', 'shipped', 'canceled']).optional(),
    },
    async ({ milestone_id, ...patch }) => {
      const token = await getToken();
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) body[k] = v;
      }
      const milestone = await trackRequest<Milestone>(
        `/milestones/${encodeURIComponent(milestone_id)}`,
        { token, method: 'PATCH', body },
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(milestone) }],
      };
    },
  );

  server.tool(
    'delete_milestone',
    'Delete a milestone. Issues that were on it become un-milestoned.',
    {
      milestone_id: z.string().min(1).describe('Milestone id'),
    },
    async ({ milestone_id }) => {
      const token = await getToken();
      await trackRequest<void>(`/milestones/${encodeURIComponent(milestone_id)}`, {
        token,
        method: 'DELETE',
      });
      return {
        content: [{ type: 'text' as const, text: `Milestone ${milestone_id} deleted.` }],
      };
    },
  );
}
