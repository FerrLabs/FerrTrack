import { afterEach, describe, expect, it } from 'vitest';
import { buildIssuePage } from '../issue-page.js';
import type { Issue } from '../issue-model.js';

function issue(n: number, title = `Issue ${n}`): Issue {
  return {
    id: `id-${n}`,
    ref: `FT-${n}`,
    project_id: 'p',
    title,
    body: 'x'.repeat(500),
    status: 'open',
    kind: 'bug',
    priority: 'high',
    due_date: null,
    estimate: null,
    labels: ['a'],
    assignee_id: null,
    author_id: 'u',
    cycle_id: null,
    milestone_id: null,
    parent_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };
}

const range = (count: number): Issue[] => Array.from({ length: count }, (_, i) => issue(i + 1));

describe('buildIssuePage', () => {
  afterEach(() => {
    delete process.env.FERRLABS_MCP_MAX_TOOL_BYTES;
  });

  it('keeps only the compact row fields', () => {
    const page = buildIssuePage({ items: [issue(1)], offset: 0, limit: 5 });

    expect(page.issues[0]).toEqual({
      ref: 'FT-1',
      title: 'Issue 1',
      status: 'open',
      assignee_id: null,
      priority: 'high',
      updated_at: '2026-01-02T00:00:00Z',
    });
  });

  it('is the last page when the probe row did not come back', () => {
    const page = buildIssuePage({ items: range(3), offset: 10, limit: 5 });

    expect(page).toMatchObject({ count: 3, has_more: false, next_offset: null, offset: 10 });
  });

  it('drops the probe row and points at the next offset when one more exists', () => {
    const page = buildIssuePage({ items: range(6), offset: 10, limit: 5 });

    expect(page.issues.map((i) => i.ref)).toEqual(['FT-1', 'FT-2', 'FT-3', 'FT-4', 'FT-5']);
    expect(page).toMatchObject({ has_more: true, next_offset: 15 });
    expect(page.notice).toBeUndefined();
  });

  it('is the last page when exactly limit rows came back', () => {
    const page = buildIssuePage({ items: range(200), offset: 0, limit: 200 });

    expect(page).toMatchObject({ count: 200, has_more: false, next_offset: null });
  });

  it('reports more when a row beyond a full 200 page is present', () => {
    const page = buildIssuePage({ items: range(201), offset: 0, limit: 200 });

    expect(page).toMatchObject({ count: 200, has_more: true, next_offset: 200 });
  });

  it('cuts at a row boundary under the size budget and resumes exactly where it stopped', () => {
    process.env.FERRLABS_MCP_MAX_TOOL_BYTES = '900';
    const page = buildIssuePage({ items: range(21), offset: 40, limit: 20 });

    expect(page.count).toBeGreaterThan(0);
    expect(page.count).toBeLessThan(20);
    expect(page.has_more).toBe(true);
    expect(page.next_offset).toBe(40 + page.count);
    expect(page.notice).toContain(`offset=${40 + page.count}`);
    expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThanOrEqual(900);
  });

  it('always returns at least one row so paging cannot stall', () => {
    process.env.FERRLABS_MCP_MAX_TOOL_BYTES = '10';
    const page = buildIssuePage({ items: range(3), offset: 0, limit: 3 });

    expect(page.count).toBe(1);
    expect(page.next_offset).toBe(1);
  });
});
