import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@ferrlabs/mcp-core';

process.env.FERRLABS_API_TOKEN = 'test-token';

type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean };

const annotations = new Map<string, Annotations | undefined>();
const mockServer = {
  tool: vi.fn((name: string, _desc: string, _schema: unknown, ...rest: unknown[]) => {
    annotations.set(name, rest.length > 1 ? (rest[0] as Annotations) : undefined);
  }),
} as unknown as McpServer;

const DESTRUCTIVE = ['delete_issue_comment', 'delete_cycle', 'delete_milestone'];
const READ_ONLY = [
  'list_track_projects',
  'get_project',
  'list_track_issues',
  'get_issue',
  'list_issue_links',
  'list_issue_comments',
  'list_cycles',
  'get_cycle',
  'list_cycle_issues',
  'list_milestones',
  'get_milestone',
  'list_track_users',
  'search_track',
];

describe('tool annotations', async () => {
  const { registerProjectTools } = await import('../projects.js');
  const { registerIssueDetailsTool } = await import('../issue-details.js');
  const { registerIssueTools } = await import('../issues.js');
  const { registerCommentTools } = await import('../comments.js');
  const { registerCycleTools } = await import('../cycles.js');
  const { registerMilestoneTools } = await import('../milestones.js');
  const { registerSearchTools } = await import('../search.js');
  registerProjectTools(mockServer);
  registerIssueDetailsTool(mockServer);
  registerIssueTools(mockServer);
  registerCommentTools(mockServer);
  registerCycleTools(mockServer);
  registerMilestoneTools(mockServer);
  registerSearchTools(mockServer);

  it.each(DESTRUCTIVE)('%s is marked destructive', (name) => {
    expect(annotations.get(name)?.destructiveHint).toBe(true);
  });

  it.each(READ_ONLY)('%s is marked read-only', (name) => {
    expect(annotations.get(name)?.readOnlyHint).toBe(true);
  });

  it('marks no other tool destructive or read-only', () => {
    const flagged = new Set([...DESTRUCTIVE, ...READ_ONLY]);
    for (const [name, a] of annotations) {
      if (!flagged.has(name)) {
        expect(a?.destructiveHint, name).toBeUndefined();
        expect(a?.readOnlyHint, name).toBeUndefined();
      }
    }
  });

  it('covers every registered tool', () => {
    expect(annotations.size).toBe(DESTRUCTIVE.length + READ_ONLY.length + 11);
  });
});
