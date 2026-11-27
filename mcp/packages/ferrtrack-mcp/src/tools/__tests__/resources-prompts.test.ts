import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@ferrlabs/mcp-core';

process.env.FERRLABS_API_TOKEN = 'test-token';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('project issues resource', () => {
  let template: { listCallback?: () => Promise<{ resources: unknown[] }> };
  let read: (
    uri: URL,
    vars: { slug: string },
  ) => Promise<{ contents: { uri: string; text: string }[] }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const server = {
      registerResource: vi.fn(
        (_n: string, tpl: typeof template, _meta: unknown, cb: typeof read) => {
          template = tpl;
          read = cb;
        },
      ),
    } as unknown as McpServer;
    const { registerIssueResources } = await import('../../resources/issues.js');
    registerIssueResources(server);
  });

  it('lists one resource per project', async () => {
    mockFetch.mockResolvedValue(ok([{ slug: 'web' }, { slug: 'api' }]));

    const { resources } = await (
      template as unknown as {
        listCallback: () => Promise<{ resources: unknown[] }>;
      }
    ).listCallback();

    expect(resources).toEqual([
      {
        uri: 'ferrtrack://project/web/issues',
        name: 'web open issues',
        mimeType: 'application/json',
      },
      {
        uri: 'ferrtrack://project/api/issues',
        name: 'api open issues',
        mimeType: 'application/json',
      },
    ]);
  });

  it('reads the open issues of the requested project', async () => {
    mockFetch.mockResolvedValue({ ...ok([]), headers: new Headers({ 'x-total-count': '0' }) });

    const result = await read(new URL('ferrtrack://project/web/issues'), { slug: 'web' });

    expect(String(mockFetch.mock.calls[0][0])).toContain('project=web&status=open');
    expect(result.contents[0].uri).toBe('ferrtrack://project/web/issues');
  });
});

describe('triage prompt', () => {
  let build: (args: { project_slug: string; limit?: string }) => {
    messages: { role: string; content: { text: string } }[];
  };

  beforeEach(async () => {
    const server = {
      prompt: vi.fn((_n: string, _d: string, _s: unknown, cb: typeof build) => {
        build = cb;
      }),
    } as unknown as McpServer;
    const { registerTriagePrompt } = await import('../../prompts/triage.js');
    registerTriagePrompt(server);
  });

  it('points at the project resource and forbids updating before approval', () => {
    const text = build({ project_slug: 'web' }).messages[0].content.text;

    expect(text).toContain('`ferrtrack://project/web/issues`');
    expect(text).toContain('Do not call `update_issue` yet');
    expect(text).not.toContain('limit=');
  });

  it('passes the limit through when given', () => {
    const text = build({ project_slug: 'web', limit: '20' }).messages[0].content.text;

    expect(text).toContain('status=open and limit=20');
  });
});
