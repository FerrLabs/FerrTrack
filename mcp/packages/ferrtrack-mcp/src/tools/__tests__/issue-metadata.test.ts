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
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function failure(status: number, code: string): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify({ error: 'api said no', code })),
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
const VIEW = {
  items: [
    {
      key: 'github.issue',
      namespace: 'github',
      managed_by: 'GitHub',
      value: { number: 7 },
      writer: {
        id: 'u1',
        kind: 'integration',
        name: 'Connected app',
        handle: 'c',
        avatar_url: null,
      },
      created_at: '2026-11-27T10:00:00Z',
      updated_at: '2026-11-27T10:00:00Z',
    },
  ],
  size_bytes: 12,
  limit_bytes: 16384,
  can_delete: true,
};

describe('issue metadata tools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    handlers.clear();
    schemas.clear();
    mockFetch.mockResolvedValue(ok(VIEW));
    const { registerIssueMetadataTools } = await import('../issue-metadata.js');
    registerIssueMetadataTools(mockServer);
  });

  it('get_issue_metadata reads the metadata collection with the bearer token', async () => {
    const result = await handlers.get('get_issue_metadata')!({ issue_ref: 'FT-12' });

    const call = lastCall();
    expect(call.method).toBe('GET');
    expect(call.url).toBe(`${TRACK}/issues/FT-12/metadata`);
    expect(call.headers['x-ferrtrack-api-version']).toBe('2026-08-04');
    expect(JSON.parse(result.content[0].text!)).toEqual(VIEW);
  });

  it('encodes the issue ref in the path', async () => {
    await handlers.get('get_issue_metadata')!({ issue_ref: 'a/b' });
    expect(lastCall().url).toBe(`${TRACK}/issues/a%2Fb/metadata`);
  });

  it('set_issue_metadata folds set and delete into one PATCH, deletes as null', async () => {
    await handlers.get('set_issue_metadata')!({
      issue_ref: 'FT-12',
      set: { 'github.issue': { number: 7 }, 'import.flag': false, 'import.count': 0 },
      delete: ['import.source'],
    });

    const call = lastCall();
    expect(call.method).toBe('PATCH');
    expect(call.url).toBe(`${TRACK}/issues/FT-12/metadata`);
    expect(call.body).toEqual({
      'github.issue': { number: 7 },
      'import.flag': false,
      'import.count': 0,
      'import.source': null,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('works with only set or only delete', async () => {
    await handlers.get('set_issue_metadata')!({ issue_ref: 'FT-1', set: { 'a.b': 1 } });
    expect(lastCall().body).toEqual({ 'a.b': 1 });

    mockFetch.mockClear();
    await handlers.get('set_issue_metadata')!({ issue_ref: 'FT-1', delete: ['a.b'] });
    expect(lastCall().body).toEqual({ 'a.b': null });
  });

  it.each([
    [{ issue_ref: 'FT-1' }, /at least one key/],
    [{ issue_ref: 'FT-1', set: {}, delete: [] }, /at least one key/],
    [{ issue_ref: 'FT-1', set: { 'a.b': null } }, /cannot hold null \(a\.b\)/],
    [{ issue_ref: 'FT-1', set: { 'a.b': 1 }, delete: ['a.b'] }, /both set and delete: a\.b/],
  ])('refuses %j before calling the API', async (params, message) => {
    await expect(handlers.get('set_issue_metadata')!(params)).rejects.toThrow(message);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  describe('schema', () => {
    const schema = () => z.object(schemas.get('set_issue_metadata')!);

    it('accepts namespaced keys and arbitrary JSON values', () => {
      const parsed = schema().safeParse({
        issue_ref: 'FT-1',
        set: { 'ferrfleet.triage.fingerprint': 'x', 'a.b-c_d': { n: [1, null] } },
        delete: ['import.source'],
      });
      expect(parsed.success).toBe(true);
    });

    it.each(['plain', 'Upper.case', '.lead', 'trail.', 'a..b', 'a b.c', `a.${'x'.repeat(63)}`])(
      'rejects the key %s in set and in delete with the API message',
      (badKey) => {
        for (const params of [
          { issue_ref: 'FT-1', set: { [badKey]: 1 } },
          { issue_ref: 'FT-1', delete: [badKey] },
        ]) {
          const parsed = schema().safeParse(params);
          expect(parsed.success).toBe(false);
          expect(JSON.stringify(parsed.error?.issues)).toContain('metadata key is invalid');
        }
      },
    );

    it('accepts a key of exactly 64 characters', () => {
      const parsed = schema().safeParse({
        issue_ref: 'FT-1',
        delete: [`a.${'x'.repeat(62)}`],
      });
      expect(parsed.success).toBe(true);
    });
  });

  it.each([
    ['METADATA_VALUE_TOO_LARGE', 400, /4 KiB/],
    ['METADATA_TOTAL_TOO_LARGE', 400, /16 KiB/],
    ['METADATA_KEY_INVALID', 400, /metadata key is invalid/],
    ['METADATA_NAMESPACE_RESERVED', 403, /integrations only/],
    ['ISSUE_NOT_FOUND', 404, /Issue not found/],
    ['TOKEN_SCOPE_REQUIRED', 403, /lacks the scope/],
  ])('maps the API code %s to an explanatory error', async (code, status, message) => {
    mockFetch.mockResolvedValue(failure(status, code));

    const error = await handlers.get('set_issue_metadata')!({
      issue_ref: 'FT-1',
      set: { 'a.b': 1 },
    }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(code);
    expect((error as Error).message).toMatch(message);
  });

  it('get_issue_metadata maps a missing issue', async () => {
    mockFetch.mockResolvedValue(failure(404, 'ISSUE_NOT_FOUND'));
    await expect(handlers.get('get_issue_metadata')!({ issue_ref: 'FT-9' })).rejects.toThrow(
      /Issue not found/,
    );
  });
});
