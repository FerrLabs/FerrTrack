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

function ok(status: number, body: unknown): Response {
  return {
    ok: true,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function noContent(): Response {
  return { ok: true, status: 204, text: () => Promise.resolve('') } as unknown as Response;
}

function failure(status: number, code: string, error = 'api said no'): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify({ error, code })),
  } as unknown as Response;
}

function lastCall(): { url: string; method: string; body: unknown } {
  const [url, init] = mockFetch.mock.calls[0];
  return {
    url: String(url),
    method: init.method ?? 'GET',
    body: init.body ? JSON.parse(init.body) : undefined,
  };
}

const TRACK = 'https://api.ferrtrack.com';
const EDGE = { id: 'e1', ref: 'FT-13', title: 'Other', status: 'open' };

describe('issue dependency tools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    handlers.clear();
    schemas.clear();
    const { registerDependencyTools } = await import('../dependencies.js');
    registerDependencyTools(mockServer);
  });

  it('list_issue_dependencies reads blocks and blocked_by', async () => {
    const body = { blocks: [EDGE], blocked_by: [{ ...EDGE, id: 'e2', ref: 'FT-2' }] };
    mockFetch.mockResolvedValue(ok(200, body));

    const result = await handlers.get('list_issue_dependencies')!({ issue_ref: 'FT-12' });

    expect(lastCall()).toEqual({
      url: `${TRACK}/issues/FT-12/dependencies`,
      method: 'GET',
      body: undefined,
    });
    expect(JSON.parse(result.content[0].text!)).toEqual(body);
  });

  it('list_issue_dependencies encodes the ref and maps no errors away', async () => {
    mockFetch.mockResolvedValue(failure(404, 'ISSUE_NOT_FOUND', 'no issue `X`'));

    await expect(handlers.get('list_issue_dependencies')!({ issue_ref: 'A/B' })).rejects.toThrow(
      'no issue',
    );
    expect(lastCall().url).toBe(`${TRACK}/issues/A%2FB/dependencies`);
  });

  it.each(['blocks', 'blocked_by'])('add_issue_dependency posts relation %s', async (relation) => {
    mockFetch.mockResolvedValue(ok(201, EDGE));

    const result = await handlers.get('add_issue_dependency')!({
      issue_ref: 'FT-12',
      relation,
      other_ref: 'FT-13',
    });

    expect(lastCall()).toEqual({
      url: `${TRACK}/issues/FT-12/dependencies`,
      method: 'POST',
      body: { relation, other_ref: 'FT-13' },
    });
    expect(JSON.parse(result.content[0].text!)).toEqual(EDGE);
  });

  it('add_issue_dependency schema only accepts the API relations', () => {
    const relation = schemas.get('add_issue_dependency')!.relation;
    expect(relation.safeParse('blocks').success).toBe(true);
    expect(relation.safeParse('blocked_by').success).toBe(true);
    expect(relation.safeParse('depends_on').success).toBe(false);
  });

  it.each([
    [404, 'ISSUE_NOT_FOUND', /Issue not found.*both refs/s],
    [400, 'DEP_SELF', /cannot depend on itself/],
    [400, 'DEP_CYCLE', /blocking cycle/],
    [409, 'DEP_EXISTS', /already exists/],
    [403, 'TOKEN_SCOPE_REQUIRED', /scope/],
  ])('add_issue_dependency maps %s %s to a clear error', async (status, code, pattern) => {
    mockFetch.mockResolvedValue(failure(status, code));

    const call = handlers.get('add_issue_dependency')!({
      issue_ref: 'FT-1',
      relation: 'blocks',
      other_ref: 'FT-1',
    });
    await expect(call).rejects.toThrow(pattern);
    await expect(call).rejects.toThrow(`${code} (HTTP ${status})`);
  });

  it('add_issue_dependency passes unmapped errors through unchanged', async () => {
    mockFetch.mockResolvedValue(failure(500, 'SOMETHING_ELSE', 'boom'));

    await expect(
      handlers.get('add_issue_dependency')!({
        issue_ref: 'FT-1',
        relation: 'blocks',
        other_ref: 'FT-2',
      }),
    ).rejects.toThrow('boom');
  });

  it('delete_issue_dependency deletes by ref and edge id and handles 204', async () => {
    mockFetch.mockResolvedValue(noContent());

    const result = await handlers.get('delete_issue_dependency')!({
      issue_ref: 'FT-12',
      dependency_id: 'e1',
    });

    expect(lastCall()).toEqual({
      url: `${TRACK}/issues/FT-12/dependencies/e1`,
      method: 'DELETE',
      body: undefined,
    });
    expect(result.content[0].text).toBe('Dependency e1 removed.');
  });

  it('delete_issue_dependency encodes the ref and the id', async () => {
    mockFetch.mockResolvedValue(noContent());

    await handlers.get('delete_issue_dependency')!({ issue_ref: 'FT/1', dependency_id: 'a/b?c' });

    expect(lastCall().url).toBe(`${TRACK}/issues/FT%2F1/dependencies/a%2Fb%3Fc`);
  });

  it.each([
    [404, 'ISSUE_NOT_FOUND', /Issue not found/],
    [404, 'DEP_NOT_FOUND', /No such dependency.*list_issue_dependencies/s],
    [403, 'TOKEN_SCOPE_REQUIRED', /scope/],
  ])('delete_issue_dependency maps %s %s to a clear error', async (status, code, pattern) => {
    mockFetch.mockResolvedValue(failure(status, code));

    const call = handlers.get('delete_issue_dependency')!({
      issue_ref: 'FT-1',
      dependency_id: 'e1',
    });
    await expect(call).rejects.toThrow(pattern);
    await expect(call).rejects.toThrow(code);
  });
});
