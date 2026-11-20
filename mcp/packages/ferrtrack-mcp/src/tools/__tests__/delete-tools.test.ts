import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@ferrlabs/mcp-core';

process.env.FERRLABS_API_TOKEN = 'test-token';

type Handler = (params: Record<string, unknown>) => Promise<{ content: { text?: string }[] }>;

const handlers = new Map<string, Handler>();
const mockServer = {
  tool: vi.fn((name: string, _desc: string, _schema: unknown, ...rest: unknown[]) => {
    handlers.set(name, rest[rest.length - 1] as Handler);
  }),
} as unknown as McpServer;

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function noContent(): Response {
  return { ok: true, status: 204, text: () => Promise.resolve('') } as unknown as Response;
}

function failure(status: number, code: string, error = 'api said no'): Response {
  const body = { error, code };
  return {
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function request(): { url: string; method: string } {
  const [url, init] = mockFetch.mock.calls[0];
  return { url: String(url), method: init.method };
}

const TRACK = 'https://api.ferrtrack.com';

describe('delete_issue and delete_issue_comment', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    handlers.clear();
    mockFetch.mockResolvedValue(noContent());
    const { registerIssueTools } = await import('../issues.js');
    const { registerCommentTools } = await import('../comments.js');
    registerIssueTools(mockServer);
    registerCommentTools(mockServer);
  });

  it('delete_issue hits the permanent route, not the soft archive one, and handles 204', async () => {
    const result = await handlers.get('delete_issue')!({ issue_ref: 'FT-12' });

    expect(request()).toEqual({ url: `${TRACK}/issues/FT-12/permanent`, method: 'DELETE' });
    expect(result.content[0].text).toBe('Issue FT-12 permanently deleted.');
  });

  it('delete_issue encodes the ref into a single path segment', async () => {
    await handlers.get('delete_issue')!({ issue_ref: 'FT 1/2?x#y' });

    expect(request().url).toBe(`${TRACK}/issues/FT%201%2F2%3Fx%23y/permanent`);
  });

  it('delete_issue_comment deletes by ref and id and handles 204', async () => {
    const result = await handlers.get('delete_issue_comment')!({
      issue_ref: 'FT-12',
      comment_id: 'c1',
    });

    expect(request()).toEqual({ url: `${TRACK}/issues/FT-12/comments/c1`, method: 'DELETE' });
    expect(result.content[0].text).toBe('Comment c1 deleted.');
  });

  it('delete_issue_comment encodes both the ref and the id', async () => {
    await handlers.get('delete_issue_comment')!({ issue_ref: 'FT/1', comment_id: 'a/b?c' });

    expect(request().url).toBe(`${TRACK}/issues/FT%2F1/comments/a%2Fb%3Fc`);
  });

  it('delete_issue explains ORG_ADMIN_REQUIRED with the connected-app reason', async () => {
    mockFetch.mockResolvedValue(failure(403, 'ORG_ADMIN_REQUIRED'));

    await expect(handlers.get('delete_issue')!({ issue_ref: 'FT-12' })).rejects.toThrow(
      /ORG_ADMIN_REQUIRED.*owner or admin.*connected apps are always refused/s,
    );
  });

  it.each([
    ['delete_issue', { issue_ref: 'FT-1' }, 403, 'TOKEN_SCOPE_REQUIRED', /scope/],
    ['delete_issue', { issue_ref: 'FT-1' }, 404, 'ISSUE_NOT_FOUND', /Issue not found/],
    ['delete_issue', { issue_ref: 'FT-1' }, 503, 'IDENTITY_PLANE_UNAVAILABLE', /retry/],
    [
      'delete_issue_comment',
      { issue_ref: 'FT-1', comment_id: 'c' },
      403,
      'COMMENT_NOT_OWNER',
      /only delete your own comments/,
    ],
    [
      'delete_issue_comment',
      { issue_ref: 'FT-1', comment_id: 'c' },
      404,
      'COMMENT_NOT_FOUND',
      /Comment not found/,
    ],
  ])('%s maps %s %s to a clear error', async (tool, args, status, code, pattern) => {
    mockFetch.mockResolvedValue(failure(status, code));

    const call = handlers.get(tool)!(args);
    await expect(call).rejects.toThrow(pattern);
    await expect(call).rejects.toThrow(code);
  });

  it('passes unmapped API errors through unchanged', async () => {
    mockFetch.mockResolvedValue(failure(500, 'SOMETHING_ELSE', 'boom'));

    await expect(handlers.get('delete_issue')!({ issue_ref: 'FT-1' })).rejects.toThrow('boom');
  });
});
