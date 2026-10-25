import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ZodTypeAny } from 'zod';
import type { McpServer } from '@ferrlabs/mcp-core';

process.env.FERRLABS_API_TOKEN = 'test-token';

type Handler = (params: Record<string, unknown>) => Promise<{ content: { text?: string }[] }>;

const handlers = new Map<string, Handler>();
const schemas = new Map<string, Record<string, ZodTypeAny>>();
const mockServer = {
  tool: vi.fn(
    (name: string, _desc: string, schema: Record<string, ZodTypeAny>, ...rest: unknown[]) => {
      handlers.set(name, rest[rest.length - 1] as Handler);
      schemas.set(name, schema);
    },
  ),
} as unknown as McpServer;

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function ok(body: unknown = { id: 'x' }): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function lastCall(): {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
} {
  const [url, init] = mockFetch.mock.calls[0];
  return {
    url: String(url),
    method: init.method ?? 'GET',
    body: init.body ? JSON.parse(init.body) : undefined,
    headers: init.headers as Record<string, string>,
  };
}

const TRACK = 'https://api.ferrtrack.com';

describe('ferrtrack write tools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    handlers.clear();
    schemas.clear();
    mockFetch.mockResolvedValue(ok());
    const { registerIssueTools } = await import('../issues.js');
    const { registerCycleTools } = await import('../cycles.js');
    const { registerMilestoneTools } = await import('../milestones.js');
    const { registerCommentTools } = await import('../comments.js');
    registerIssueTools(mockServer);
    registerCycleTools(mockServer);
    registerMilestoneTools(mockServer);
    registerCommentTools(mockServer);
  });

  it('negotiates the contract by date header, with no version left in the path', async () => {
    await handlers.get('create_issue')!({ project_slug: 'web', title: 'Bug' });

    const call = lastCall();
    expect(call.headers['x-ferrtrack-api-version']).toBe('2026-08-04');
    expect(call.url).not.toContain('/v1/');
  });

  it('every call goes to the FerrTrack API, not the unified one', async () => {
    await handlers.get('create_issue')!({ project_slug: 'web', title: 'Bug' });
    expect(lastCall().url.startsWith('https://api.ferrtrack.com')).toBe(true);
    expect(lastCall().url).not.toContain('api.ferrlabs.com');
  });

  it('create_issue posts to the project issues collection with defaults filled in', async () => {
    await handlers.get('create_issue')!({ project_slug: 'web', title: 'Bug' });

    const call = lastCall();
    expect(call.url).toBe(`${TRACK}/projects/web/issues`);
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({
      title: 'Bug',
      body: '',
      kind: 'feat',
      labels: [],
      assignee_id: null,
    });
  });

  it('update_issue patches by ref and sends only what was passed', async () => {
    await handlers.get('update_issue')!({ issue_ref: 'FT-12', status: 'closed' });

    const call = lastCall();
    expect(call.url).toBe(`${TRACK}/issues/FT-12`);
    expect(call.method).toBe('PATCH');
    expect(call.body).toEqual({ status: 'closed' });
  });

  it('update_issue can clear an assignee, which is not the same as omitting it', async () => {
    await handlers.get('update_issue')!({ issue_ref: 'FT-12', assignee_id: null });
    expect(lastCall().body).toEqual({ assignee_id: null });
  });

  it('delete_cycle uses DELETE on the cycle and names it back', async () => {
    const result = await handlers.get('delete_cycle')!({ cycle_id: 'c9' });

    const call = lastCall();
    expect(call.url).toBe(`${TRACK}/cycles/c9`);
    expect(call.method).toBe('DELETE');
    expect(result.content[0].text).toContain('c9');
  });

  it('plan_next_cycle posts to the plan sub-resource rather than creating a cycle', async () => {
    await handlers.get('plan_next_cycle')!({ project_slug: 'web' });

    const call = lastCall();
    expect(call.url).toBe(`${TRACK}/projects/web/cycles/plan`);
    expect(call.method).toBe('POST');
  });

  it('escapes an issue ref so it cannot climb the path', async () => {
    await handlers.get('update_issue')!({ issue_ref: '../projects', title: 'x' });
    expect(lastCall().url).toBe(`${TRACK}/issues/..%2Fprojects`);
  });

  it('rejects an issue status outside the declared set', () => {
    const status = schemas.get('update_issue')!.status;
    expect(status.safeParse('closed').success).toBe(true);
    expect(status.safeParse('done').success).toBe(false);
  });

  it('does not expose get tools for routes the API does not serve', () => {
    expect(handlers.has('get_cycle')).toBe(false);
    expect(handlers.has('get_milestone')).toBe(false);
  });

  it('create_cycle requires ISO datetimes, since the API rejects plain dates', () => {
    const { starts_at, ends_at } = schemas.get('create_cycle')!;
    expect(starts_at.safeParse('2026-01-05T00:00:00Z').success).toBe(true);
    expect(starts_at.safeParse('2026-01-05T00:00:00+02:00').success).toBe(true);
    expect(starts_at.safeParse('2026-01-05').success).toBe(false);
    expect(ends_at.safeParse('2026-01-19').success).toBe(false);
  });

  it('update_cycle has no status field, since status is derived from dates', () => {
    expect(schemas.get('update_cycle')).not.toHaveProperty('status');
  });

  it('create_milestone sends summary and target_date', async () => {
    await handlers.get('create_milestone')!({
      project_slug: 'web',
      name: 'v1',
      summary: 'first release',
      target_date: '2026-03-01',
    });

    const call = lastCall();
    expect(call.url).toBe(`${TRACK}/projects/web/milestones`);
    expect(call.body).toEqual({ name: 'v1', summary: 'first release', target_date: '2026-03-01' });
  });

  it('update_milestone patches summary and target_date and nothing else', async () => {
    await handlers.get('update_milestone')!({ milestone_id: 'm1', target_date: null });

    const call = lastCall();
    expect(call.url).toBe(`${TRACK}/milestones/m1`);
    expect(call.method).toBe('PATCH');
    expect(call.body).toEqual({ target_date: null });
  });

  it('update_milestone accepts the API status values only', () => {
    const { status } = schemas.get('update_milestone')!;
    for (const ok of ['planned', 'in_progress', 'shipped', 'canceled']) {
      expect(status.safeParse(ok).success).toBe(true);
    }
    for (const bad of ['open', 'completed', 'cancelled']) {
      expect(status.safeParse(bad).success).toBe(false);
    }
  });
});
