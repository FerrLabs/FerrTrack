import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z, type ZodTypeAny } from 'zod';
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

  const CYCLE = '3f2b6c1e-8d4a-4b7e-9a10-5c6d7e8f9a0b';
  const MILESTONE = '7a1d2e3f-4b5c-4d6e-8f70-91a2b3c4d5e6';
  const PARENT = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';

  function parseUpdate(input: Record<string, unknown>) {
    return z.object(schemas.get('update_issue')!).safeParse({ issue_ref: 'FT-12', ...input });
  }

  function parseCreate(input: Record<string, unknown>) {
    return z.object(schemas.get('create_issue')!).safeParse({
      project_slug: 'web',
      title: 'Bug',
      ...input,
    });
  }

  it('update_issue forwards priority, estimate, cycle, milestone, due date and parent when set', async () => {
    const patch = {
      priority: 'urgent',
      estimate: 0,
      cycle_id: CYCLE,
      milestone_id: MILESTONE,
      due_date: '2026-12-01',
      parent_id: PARENT,
    };
    await handlers.get('update_issue')!({ issue_ref: 'FT-12', ...patch });
    expect(lastCall().body).toEqual(patch);
  });

  it('update_issue sends null to clear estimate, cycle, milestone, due date and parent', async () => {
    const cleared = {
      estimate: null,
      cycle_id: null,
      milestone_id: null,
      due_date: null,
      parent_id: null,
    };
    await handlers.get('update_issue')!({ issue_ref: 'FT-12', ...cleared });
    expect(lastCall().body).toEqual(cleared);
  });

  it('update_issue leaves the new fields out of the body when they are not passed', async () => {
    await handlers.get('update_issue')!({ issue_ref: 'FT-12', title: 'New' });
    expect(lastCall().body).toEqual({ title: 'New' });
  });

  it('update_issue schema accepts every API priority and rejects anything else', () => {
    for (const priority of ['none', 'low', 'medium', 'high', 'urgent']) {
      expect(parseUpdate({ priority }).success).toBe(true);
    }
    for (const priority of ['critical', 'URGENT', '', null]) {
      expect(parseUpdate({ priority }).success).toBe(false);
    }
  });

  it('update_issue does not let priority be cleared with null, the API has no such state', () => {
    expect(parseUpdate({ priority: null }).success).toBe(false);
  });

  it('update_issue schema bounds estimate to integers 0-1000 and allows null', () => {
    for (const estimate of [0, 1, 1000, null]) {
      expect(parseUpdate({ estimate }).success).toBe(true);
    }
    for (const estimate of [-1, 1001, 2.5, '5']) {
      expect(parseUpdate({ estimate }).success).toBe(false);
    }
  });

  it('update_issue schema requires UUIDs for cycle, milestone and parent, and ISO dates', () => {
    for (const field of ['cycle_id', 'milestone_id', 'parent_id']) {
      expect(parseUpdate({ [field]: CYCLE }).success).toBe(true);
      expect(parseUpdate({ [field]: 'FT-12' }).success).toBe(false);
    }
    expect(parseUpdate({ due_date: '2026-12-01' }).success).toBe(true);
    expect(parseUpdate({ due_date: '12/01/2026' }).success).toBe(false);
    expect(parseUpdate({ due_date: '2026-13-40' }).success).toBe(false);
  });

  it('create_issue sends priority, estimate, due date and parent only when provided', async () => {
    await handlers.get('create_issue')!({
      project_slug: 'web',
      title: 'Bug',
      priority: 'high',
      estimate: 3,
      due_date: '2026-12-01',
      parent_id: PARENT,
    });
    expect(lastCall().body).toEqual({
      title: 'Bug',
      body: '',
      kind: 'feat',
      labels: [],
      assignee_id: null,
      priority: 'high',
      estimate: 3,
      due_date: '2026-12-01',
      parent_id: PARENT,
    });
  });

  it('create_issue schema rejects an unknown priority and an out-of-range estimate', () => {
    expect(parseCreate({ priority: 'critical' }).success).toBe(false);
    expect(parseCreate({ estimate: 1001 }).success).toBe(false);
    expect(parseCreate({ priority: 'low', estimate: 1000 }).success).toBe(true);
  });

  it('create_issue does not accept null for the new fields, since there is nothing to clear', () => {
    expect(parseCreate({ estimate: null }).success).toBe(false);
    expect(parseCreate({ priority: null }).success).toBe(false);
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
