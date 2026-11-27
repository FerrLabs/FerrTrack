import { describe, it, expect, vi } from 'vitest';
import type { ZodTypeAny } from 'zod';
import type { McpServer } from '@ferrlabs/mcp-core';

process.env.FERRLABS_API_TOKEN = 'test-token';

const schemas = new Map<string, string[]>();
const names: string[] = [];
const mockServer = {
  tool: vi.fn((name: string, _desc: string, schema: Record<string, ZodTypeAny>) => {
    names.push(name);
    schemas.set(name, Object.keys(schema).sort());
  }),
  resource: vi.fn(),
  prompt: vi.fn(),
  registerResource: vi.fn(),
  registerPrompt: vi.fn(),
} as unknown as McpServer;

const EXISTING: Record<string, string[]> = {
  get_issue: ['issue_ref'],
  list_issue_links: ['issue_ref'],
  delete_issue: ['issue_ref'],
  list_issue_comments: ['issue_ref'],
  create_issue_comment: ['body', 'issue_ref'],
  delete_issue_comment: ['comment_id', 'issue_ref'],
};

const NEW: Record<string, string[]> = {
  list_issue_dependencies: ['issue_ref'],
  add_issue_dependency: ['issue_ref', 'other_ref', 'relation'],
  delete_issue_dependency: ['dependency_id', 'issue_ref'],
};

describe('register', async () => {
  const { register } = await import('../../register.js');
  register(mockServer);

  it.each(Object.entries(EXISTING))('keeps the %s schema unchanged', (name, keys) => {
    expect(schemas.get(name)).toEqual(keys);
  });

  it.each(Object.entries(NEW))('registers %s', (name, keys) => {
    expect(schemas.get(name)).toEqual(keys);
  });

  it('registers each tool name once', () => {
    expect(new Set(names).size).toBe(names.length);
  });
});
