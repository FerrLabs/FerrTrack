import { maxToolBytes } from '@ferrlabs/mcp-core';
import type { Issue } from './issue-model.js';

type IssueRow = Pick<Issue, 'ref' | 'title' | 'status' | 'assignee_id' | 'priority'> & {
  updated_at: string;
};

export interface IssuePage {
  count: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
  notice?: string;
  issues: IssueRow[];
}

interface PageInput {
  items: readonly Issue[];
  offset: number;
  limit: number;
}

const METADATA_RESERVE_BYTES = 400;

function toRow(issue: Issue): IssueRow {
  return {
    ref: issue.ref,
    title: issue.title,
    status: issue.status,
    assignee_id: issue.assignee_id,
    priority: issue.priority,
    updated_at: issue.updated_at,
  };
}

function rowsThatFit(rows: readonly IssueRow[], budget: number): number {
  let used = METADATA_RESERVE_BYTES;
  for (const [index, row] of rows.entries()) {
    used += Buffer.byteLength(JSON.stringify(row), 'utf8') + 1;
    if (used > budget) return Math.max(index, 1);
  }
  return rows.length;
}

export function buildIssuePage({ items, offset, limit }: PageInput): IssuePage {
  const requested = items.slice(0, limit).map(toRow);
  const kept = rowsThatFit(requested, maxToolBytes());
  const issues = requested.slice(0, kept);
  const cutForSize = kept < requested.length;
  const hasMore = cutForSize || items.length > limit;

  return {
    count: issues.length,
    offset,
    has_more: hasMore,
    next_offset: hasMore ? offset + issues.length : null,
    ...(cutForSize && {
      notice: `Page cut to ${issues.length} of ${requested.length} requested issues to fit the response size limit. Call again with offset=${offset + issues.length} for the rest, or pass a smaller limit.`,
    }),
    issues,
  };
}
