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

function ok(body: unknown): Response {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: true,
    status: body === undefined ? 204 : 200,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

function failure(status: number, code: string): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify({ error: 'nope', code })),
  } as unknown as Response;
}

function lastCall(): { url: string; method: string; body: unknown; auth: string } {
  const [url, init] = mockFetch.mock.calls[0];
  return {
    url: String(url),
    method: init.method ?? 'GET',
    body: init.body ? JSON.parse(init.body) : undefined,
    auth: init.headers.Authorization ?? init.headers.authorization,
  };
}

function parse(tool: string, input: Record<string, unknown>) {
  return z.object(schemas.get(tool)!).safeParse(input);
}

const TRACK = 'https://api.ferrtrack.com';
const PAYLOAD = { id: 'x1' };

interface Case {
  tool: string;
  params: Record<string, unknown>;
  url: string;
  method: string;
  body?: unknown;
}

const CASES: Case[] = [
  { tool: 'get_issue', params: { issue_ref: 'FT-1' }, url: '/issues/FT-1', method: 'GET' },
  { tool: 'list_track_projects', params: {}, url: '/projects', method: 'GET' },
  { tool: 'get_project', params: { project_slug: 'web' }, url: '/projects/web', method: 'GET' },
  {
    tool: 'create_project',
    params: { slug: 'web', prefix: 'WEB', name: 'Web' },
    url: '/projects',
    method: 'POST',
    body: { slug: 'web', prefix: 'WEB', name: 'Web', summary: null },
  },
  {
    tool: 'create_project',
    params: { slug: 'web', prefix: 'WEB', name: 'Web', summary: 'Site' },
    url: '/projects',
    method: 'POST',
    body: { slug: 'web', prefix: 'WEB', name: 'Web', summary: 'Site' },
  },
  {
    tool: 'update_project',
    params: { project_slug: 'web', name: 'Renamed' },
    url: '/projects/web',
    method: 'PATCH',
    body: { name: 'Renamed' },
  },
  {
    tool: 'update_project',
    params: { project_slug: 'web', summary: null },
    url: '/projects/web',
    method: 'PATCH',
    body: { summary: null },
  },
  {
    tool: 'list_issue_comments',
    params: { issue_ref: 'FT-1' },
    url: '/issues/FT-1/comments',
    method: 'GET',
  },
  {
    tool: 'create_issue_comment',
    params: { issue_ref: 'FT-1', body: 'hi' },
    url: '/issues/FT-1/comments',
    method: 'POST',
    body: { body: 'hi' },
  },
  {
    tool: 'update_issue_comment',
    params: { issue_ref: 'FT-1', comment_id: 'c 1', body: 'edit' },
    url: '/issues/FT-1/comments/c%201',
    method: 'PATCH',
    body: { body: 'edit' },
  },
  {
    tool: 'list_cycles',
    params: { project_slug: 'web' },
    url: '/projects/web/cycles',
    method: 'GET',
  },
  {
    tool: 'list_cycle_issues',
    params: { cycle_id: 'cy1' },
    url: '/cycles/cy1/issues',
    method: 'GET',
  },
  {
    tool: 'create_cycle',
    params: {
      project_slug: 'web',
      name: 'C1',
      starts_at: '2026-01-05T00:00:00Z',
      ends_at: '2026-01-19T00:00:00Z',
    },
    url: '/projects/web/cycles',
    method: 'POST',
    body: { name: 'C1', starts_at: '2026-01-05T00:00:00Z', ends_at: '2026-01-19T00:00:00Z' },
  },
  {
    tool: 'plan_next_cycle',
    params: { project_slug: 'web' },
    url: '/projects/web/cycles/plan',
    method: 'POST',
  },
  {
    tool: 'update_cycle',
    params: { cycle_id: 'cy1', name: 'Renamed' },
    url: '/cycles/cy1',
    method: 'PATCH',
    body: { name: 'Renamed' },
  },
  {
    tool: 'list_milestones',
    params: { project_slug: 'web' },
    url: '/projects/web/milestones',
    method: 'GET',
  },
  {
    tool: 'create_milestone',
    params: { project_slug: 'web', name: 'M1' },
    url: '/projects/web/milestones',
    method: 'POST',
    body: { name: 'M1', summary: null, target_date: null },
  },
  {
    tool: 'create_milestone',
    params: { project_slug: 'web', name: 'M1', summary: 's', target_date: '2026-03-01' },
    url: '/projects/web/milestones',
    method: 'POST',
    body: { name: 'M1', summary: 's', target_date: '2026-03-01' },
  },
  {
    tool: 'update_milestone',
    params: { milestone_id: 'm1', status: 'shipped', target_date: null },
    url: '/milestones/m1',
    method: 'PATCH',
    body: { status: 'shipped', target_date: null },
  },
  { tool: 'search_track', params: { q: 'a b' }, url: '/search?q=a+b', method: 'GET' },
  {
    tool: 'search_track',
    params: { q: 'bug', limit: 5 },
    url: '/search?q=bug&limit=5',
    method: 'GET',
  },
  { tool: 'list_track_users', params: {}, url: '/users', method: 'GET' },
];

describe('FerrTrack API tools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    handlers.clear();
    schemas.clear();
    mockFetch.mockResolvedValue(ok(PAYLOAD));
    const { register } = await import('../../register.js');
    const full = { ...mockServer, resource: vi.fn(), prompt: vi.fn(), registerResource: vi.fn() };
    register(full as unknown as McpServer);
  });

  it.each(CASES)('$tool -> $method $url', async ({ tool, params, url, method, body }) => {
    const result = await handlers.get(tool)!(params);

    const call = lastCall();
    expect(call.url).toBe(`${TRACK}${url}`);
    expect(call.method).toBe(method);
    expect(call.body).toEqual(body);
    expect(call.auth).toBe('Bearer test-token');
    expect(JSON.parse(result.content[0].text!)).toEqual(PAYLOAD);
  });

  it.each([
    ['delete_cycle', { cycle_id: 'cy 1' }, '/cycles/cy%201', 'Cycle cy 1 deleted.'],
    ['delete_milestone', { milestone_id: 'm1' }, '/milestones/m1', 'Milestone m1 deleted.'],
    [
      'delete_issue_comment',
      { issue_ref: 'FT-1', comment_id: 'c1' },
      '/issues/FT-1/comments/c1',
      'Comment c1 deleted.',
    ],
  ])('%s deletes and confirms in text', async (tool, params, url, text) => {
    mockFetch.mockResolvedValue(ok(undefined));

    const result = await handlers.get(tool)!(params);

    expect(lastCall()).toMatchObject({ url: `${TRACK}${url}`, method: 'DELETE' });
    expect(result.content[0].text).toBe(text);
  });

  it('delete_issue_comment maps a known API error code to a readable message', async () => {
    mockFetch.mockResolvedValue(failure(403, 'COMMENT_NOT_OWNER'));

    await expect(
      handlers.get('delete_issue_comment')!({ issue_ref: 'FT-1', comment_id: 'c1' }),
    ).rejects.toThrow(/COMMENT_NOT_OWNER \(HTTP 403\): You can only delete your own comments/);
  });

  it('delete_issue_comment rethrows an unmapped API error untouched', async () => {
    mockFetch.mockResolvedValue(failure(500, 'SOMETHING_ELSE'));

    await expect(
      handlers.get('delete_issue_comment')!({ issue_ref: 'FT-1', comment_id: 'c1' }),
    ).rejects.toThrow(/nope/);
  });

  it('read tools surface API failures instead of returning empty content', async () => {
    mockFetch.mockResolvedValue(failure(404, 'ISSUE_NOT_FOUND'));

    await expect(handlers.get('get_issue')!({ issue_ref: 'FT-404' })).rejects.toThrow();
  });

  describe('input validation', () => {
    it.each([
      ['create_project', { slug: 'Web', prefix: 'WEB', name: 'Web' }],
      ['create_project', { slug: 'w', prefix: 'WEB', name: 'Web' }],
      ['create_project', { slug: 'web', prefix: 'web', name: 'Web' }],
      ['create_project', { slug: 'web', prefix: 'W', name: 'Web' }],
      [
        'create_cycle',
        { project_slug: 'web', name: 'C', starts_at: 'tomorrow', ends_at: '2026-01-19T00:00:00Z' },
      ],
      ['create_milestone', { project_slug: 'web', name: 'M', target_date: '01/03/2026' }],
      ['update_milestone', { milestone_id: 'm1', status: 'done' }],
      ['search_track', { q: '' }],
      ['search_track', { q: 'x', limit: 0 }],
      ['search_track', { q: 'x', limit: 101 }],
      ['search_track', { q: 'x', limit: 1.5 }],
      ['get_issue', { issue_ref: '' }],
    ])('%s rejects %j', (tool, input) => {
      expect(parse(tool, input).success).toBe(false);
    });

    it.each([
      ['create_project', { slug: 'web-2', prefix: 'WEB', name: 'Web' }],
      [
        'create_cycle',
        {
          project_slug: 'web',
          name: 'C',
          starts_at: '2026-01-05T00:00:00+02:00',
          ends_at: '2026-01-19T00:00:00Z',
        },
      ],
      ['update_milestone', { milestone_id: 'm1', status: 'canceled' }],
      ['search_track', { q: 'x', limit: 100 }],
    ])('%s accepts %j', (tool, input) => {
      expect(parse(tool, input).success).toBe(true);
    });
  });
});
