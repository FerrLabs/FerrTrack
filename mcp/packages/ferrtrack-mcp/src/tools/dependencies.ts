import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { trackRequest } from '../api-base.js';
import { withMappedErrors } from './delete-errors.js';

interface DependencyEdge {
  id: string;
  ref: string;
  title: string;
  status: string;
}

interface Dependencies {
  blocks: DependencyEdge[];
  blocked_by: DependencyEdge[];
}

const RELATIONS = ['blocks', 'blocked_by'] as const;

const ADD_ERRORS: Readonly<Record<string, string>> = {
  ISSUE_NOT_FOUND:
    'Issue not found. Check both refs (issue_ref and other_ref, e.g. "FT-12"); they must exist in your organization. No dependency was created.',
  DEP_SELF: 'An issue cannot depend on itself: issue_ref and other_ref must differ.',
  DEP_CYCLE:
    'That would create a blocking cycle: the other issue is already (transitively) blocked by this one in the opposite direction. Check the direction or remove the existing dependency first.',
  DEP_EXISTS: 'That dependency already exists. Nothing was changed.',
  RELATION: 'relation must be "blocks" or "blocked_by".',
  TOKEN_SCOPE_REQUIRED:
    'The token in use lacks the scope required to edit issues. Use a token that grants it.',
};

const DELETE_ERRORS: Readonly<Record<string, string>> = {
  ISSUE_NOT_FOUND: 'Issue not found. Check the ref (e.g. "FT-12"); nothing was removed.',
  DEP_NOT_FOUND:
    'No such dependency on this issue. Use the id returned by list_issue_dependencies for an edge that touches this issue; nothing was removed.',
  TOKEN_SCOPE_REQUIRED:
    'The token in use lacks the scope required to edit issues. Use a token that grants it.',
};

export function registerDependencyTools(server: McpServer) {
  server.tool(
    'list_issue_dependencies',
    'List the blocking dependencies of a FerrTrack issue by its ref (e.g. "FT-12"): `blocks` (issues this one blocks) and `blocked_by` (issues that block this one), each with the edge id, ref, title and status. The edge id is what delete_issue_dependency takes.',
    {
      issue_ref: z.string().min(1).describe('Issue ref, e.g. "FT-12"'),
    },
    { readOnlyHint: true },
    async ({ issue_ref }) => {
      const token = await getToken();
      const dependencies = await trackRequest<Dependencies>(
        `/issues/${encodeURIComponent(issue_ref)}/dependencies`,
        { token },
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(dependencies) }],
      };
    },
  );

  server.tool(
    'add_issue_dependency',
    'Record a blocking dependency between two FerrTrack issues. relation "blocks" means issue_ref blocks other_ref; "blocked_by" means other_ref blocks issue_ref. Rejects self-dependencies, blocking cycles and duplicates. Returns the created edge (id, ref, title, status of the other issue). Use this instead of writing dependencies in a description.',
    {
      issue_ref: z.string().min(1).describe('Issue ref, e.g. "FT-12"'),
      relation: z
        .enum(RELATIONS)
        .describe(
          '"blocks": issue_ref blocks other_ref. "blocked_by": other_ref blocks issue_ref.',
        ),
      other_ref: z.string().min(1).describe('Ref of the other issue, e.g. "FT-13"'),
    },
    async ({ issue_ref, relation, other_ref }) => {
      const token = await getToken();
      const edge = await withMappedErrors(ADD_ERRORS, () =>
        trackRequest<DependencyEdge>(`/issues/${encodeURIComponent(issue_ref)}/dependencies`, {
          token,
          method: 'POST',
          body: { relation, other_ref },
        }),
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(edge) }],
      };
    },
  );

  server.tool(
    'delete_issue_dependency',
    'Remove a blocking dependency from a FerrTrack issue by edge id (from list_issue_dependencies). The two issues themselves are untouched; the dependency can be re-added with add_issue_dependency.',
    {
      issue_ref: z.string().min(1).describe('Ref of either issue on the edge, e.g. "FT-12"'),
      dependency_id: z.string().min(1).describe('Dependency edge id from list_issue_dependencies'),
    },
    { destructiveHint: true },
    async ({ issue_ref, dependency_id }) => {
      const token = await getToken();
      await withMappedErrors(DELETE_ERRORS, () =>
        trackRequest<void>(
          `/issues/${encodeURIComponent(issue_ref)}/dependencies/${encodeURIComponent(dependency_id)}`,
          { token, method: 'DELETE' },
        ),
      );
      return {
        content: [{ type: 'text' as const, text: `Dependency ${dependency_id} removed.` }],
      };
    },
  );
}
