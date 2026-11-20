import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@ferrlabs/mcp-core';
import type { Issue } from '../issue-model.js';

process.env.FERRLABS_API_TOKEN = 'test-token';

type Handler = (params: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;

let listHandler: Handler;
const mockServer = {
  tool: vi.fn((name: string, _desc: string, _schema: unknown, ...rest: unknown[]) => {
    if (name === 'list_track_issues') listHandler = rest[rest.length - 1] as Handler;
  }),
} as unknown as McpServer;

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function issue(n: number, status = 'open'): Issue {
  return {
    id: `id-${n}`,
    ref: `FT-${n}`,
    project_id: 'p',
    title: `Issue ${n}`,
    body: '',
    status,
    kind: 'bug',
    priority: 'none',
    due_date: null,
    estimate: null,
    labels: [],
    assignee_id: null,
    author_id: 'u',
    cycle_id: null,
    milestone_id: null,
    parent_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };
}

function respond(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function serveBacklog(all: Issue[]): void {
  mockFetch.mockImplementation((url: string) => {
    const params = new URL(url).searchParams;
    const status = params.get('status');
    const limit = Number(params.get('limit'));
    const offset = Number(params.get('offset'));
    const matching = all.filter(
      (i) => status === 'all' || (status === 'open' ? i.status !== 'closed' : i.status === status),
    );
    return Promise.resolve(respond(matching.slice(offset, offset + limit)));
  });
}

function requestedParams(callIndex = 0): URLSearchParams {
  return new URL(String(mockFetch.mock.calls[callIndex][0])).searchParams;
}

async function call(params: Record<string, unknown>) {
  const result = await listHandler({ project_slug: 'web', ...params });
  return JSON.parse(result.content[0].text) as {
    issues: { ref: string }[];
    count: number;
    has_more: boolean;
    next_offset: number | null;
    notice?: string;
  };
}

describe('list_track_issues', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { registerIssueTools } = await import('../issues.js');
    registerIssueTools(mockServer);
  });

  afterEach(() => {
    delete process.env.FERRLABS_MCP_MAX_TOOL_BYTES;
  });

  it('queries the filtered org listing, since the per-project route ignores status and limit', async () => {
    serveBacklog([issue(1)]);
    await call({});

    const url = new URL(String(mockFetch.mock.calls[0][0]));
    expect(url.pathname).toBe('/issues');
    expect(url.searchParams.get('project')).toBe('web');
  });

  it('defaults to open issues and never returns closed ones', async () => {
    serveBacklog([issue(1), issue(2, 'closed'), issue(3, 'review')]);
    const page = await call({});

    expect(requestedParams().get('status')).toBe('open');
    expect(page.issues.map((i) => i.ref)).toEqual(['FT-1', 'FT-3']);
  });

  it.each(['closed', 'all'] as const)('sends status=%s only when asked', async (status) => {
    serveBacklog([issue(1), issue(2, 'closed')]);
    await call({ status });

    expect(requestedParams().get('status')).toBe(status);
  });

  it('forwards kind and assignee filters', async () => {
    serveBacklog([]);
    await call({ kind: 'bug', assignee_id: 'me' });

    const params = requestedParams();
    expect(params.get('kind')).toBe('bug');
    expect(params.get('assignee')).toBe('me');
  });

  it('asks the API for one row beyond the limit to detect another page', async () => {
    serveBacklog([]);
    await call({ limit: 10, offset: 30 });

    const params = requestedParams();
    expect(params.get('limit')).toBe('11');
    expect(params.get('offset')).toBe('30');
  });

  it('enumerates a backlog larger than one page exactly once by following next_offset', async () => {
    const backlog = Array.from({ length: 125 }, (_, i) => issue(i + 1));
    serveBacklog(backlog);

    const seen: string[] = [];
    let offset: number | undefined;
    let pages = 0;
    do {
      const page = await call({ limit: 50, offset });
      seen.push(...page.issues.map((i) => i.ref));
      offset = page.next_offset ?? undefined;
      pages += 1;
    } while (offset !== undefined);

    expect(pages).toBe(3);
    expect(seen).toEqual(backlog.map((i) => i.ref));
  });

  it('reports no further page when the backlog ends exactly on a page boundary', async () => {
    serveBacklog(Array.from({ length: 50 }, (_, i) => issue(i + 1)));
    const page = await call({ limit: 50 });

    expect(page).toMatchObject({ count: 50, has_more: false, next_offset: null });
  });

  it('still enumerates everything when the size limit cuts pages short, and says so', async () => {
    process.env.FERRLABS_MCP_MAX_TOOL_BYTES = '1200';
    const backlog = Array.from({ length: 30 }, (_, i) => issue(i + 1));
    serveBacklog(backlog);

    const seen: string[] = [];
    const notices: (string | undefined)[] = [];
    let offset: number | undefined;
    do {
      const result = await listHandler({ project_slug: 'web', limit: 30, offset });
      expect(result.content[0].text).not.toContain('[truncated');
      const page = JSON.parse(result.content[0].text) as Awaited<ReturnType<typeof call>>;
      seen.push(...page.issues.map((i) => i.ref));
      notices.push(page.notice);
      offset = page.next_offset ?? undefined;
    } while (offset !== undefined);

    expect(seen).toEqual(backlog.map((i) => i.ref));
    expect(notices[0]).toMatch(/response size limit/);
  });
});
