import { z } from 'zod';
import { getToken, type McpServer, toToolText } from '@ferrlabs/mcp-core';
import { trackRequest } from '../api-base.js';
import { withMappedErrors } from './delete-errors.js';

const KEY_PATTERN = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/;
const MAX_KEY_LENGTH = 64;
const MAX_KEYS_PER_CALL = 64;

export const KEY_MESSAGE =
  'metadata key is invalid: use lowercase namespaced keys like `ferrfleet.triage.fingerprint` (pattern ^[a-z0-9]+(\\.[a-z0-9_-]+)+$, at most 64 characters)';

const key = z.string().max(MAX_KEY_LENGTH, KEY_MESSAGE).regex(KEY_PATTERN, KEY_MESSAGE);

interface MetadataEntry {
  key: string;
  value: unknown;
  written_by: string;
  written_by_handle: string;
  written_by_display_name: string | null;
  written_by_is_service: boolean;
  written_via: 'person' | 'connected_app';
  created_at: string;
  updated_at: string;
}

const ERRORS: Readonly<Record<string, string>> = {
  ISSUE_NOT_FOUND:
    'Issue not found. Check the ref (e.g. "FT-12"); it must exist in your organization. Nothing was changed.',
  METADATA_KEY_INVALID: KEY_MESSAGE,
  METADATA_VALUE_TOO_LARGE:
    'A metadata value is over 4 KiB of JSON. Store less per key or split it across keys. Nothing was changed.',
  METADATA_TOTAL_TOO_LARGE:
    'The issue would hold over 16 KiB of metadata. Delete keys you no longer need in the same call. Nothing was changed.',
  METADATA_TOO_MANY_KEYS: `A call can change at most ${MAX_KEYS_PER_CALL} keys. Nothing was changed.`,
  METADATA_EMPTY_PATCH: 'Pass at least one key in set or delete.',
  TOKEN_SCOPE_REQUIRED:
    'The token in use lacks the scope required to edit issues. Use a token that grants it.',
};

export function buildPatch(
  set: Record<string, unknown> = {},
  remove: string[] = [],
): Record<string, unknown> {
  const nulls = Object.entries(set)
    .filter(([, value]) => value === null || value === undefined)
    .map(([name]) => name);
  if (nulls.length > 0) {
    throw new Error(
      `set cannot hold null (${nulls.join(', ')}): list the key in delete to remove it.`,
    );
  }
  const overlap = remove.filter((name) => name in set);
  if (overlap.length > 0) {
    throw new Error(`a key cannot be in both set and delete: ${overlap.join(', ')}.`);
  }
  const patch: Record<string, unknown> = { ...set };
  for (const name of remove) {
    patch[name] = null;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error(ERRORS.METADATA_EMPTY_PATCH);
  }
  return patch;
}

export function registerIssueMetadataTools(server: McpServer) {
  server.tool(
    'get_issue_metadata',
    'Read the metadata of a FerrTrack issue by its ref (e.g. "FT-12"): key/value data that tools attach to an issue and that is not shown on the issue itself. Returns every key with its JSON value, who wrote it (person or connected app) and when it was created and last changed. Keys are namespaced, like `ferrfleet.triage.fingerprint`.',
    {
      issue_ref: z.string().min(1).describe('Issue ref, e.g. "FT-12"'),
    },
    { readOnlyHint: true },
    async ({ issue_ref }) => {
      const token = await getToken();
      const entries = await withMappedErrors(ERRORS, () =>
        trackRequest<MetadataEntry[]>(`/issues/${encodeURIComponent(issue_ref)}/metadata`, {
          token,
        }),
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(entries) }],
      };
    },
  );

  server.tool(
    'set_issue_metadata',
    'Set and delete metadata keys on a FerrTrack issue in one atomic call: either every change applies or none does. Keys not mentioned are untouched. Keys are lowercase and namespaced (`ferrfleet.triage.fingerprint`, `github.issue`, `import.source`), at most 64 characters. Values are any JSON except null, at most 4 KiB each and 16 KiB per issue. Never store secrets or tokens here: anyone who can read the issue can read its metadata. Needs the same permission as editing the issue. Returns all metadata of the issue after the change.',
    {
      issue_ref: z.string().min(1).describe('Issue ref, e.g. "FT-12"'),
      set: z
        .record(key, z.unknown())
        .optional()
        .describe('Keys to create or replace, each with a JSON value (not null).'),
      delete: z.array(key).optional().describe('Keys to remove. Missing keys are ignored.'),
    },
    async ({ issue_ref, set, delete: remove }) => {
      const token = await getToken();
      const body = buildPatch(
        set as Record<string, unknown> | undefined,
        remove as string[] | undefined,
      );
      const entries = await withMappedErrors(ERRORS, () =>
        trackRequest<MetadataEntry[]>(`/issues/${encodeURIComponent(issue_ref)}/metadata`, {
          token,
          method: 'PATCH',
          body,
        }),
      );
      return {
        content: [{ type: 'text' as const, text: toToolText(entries) }],
      };
    },
  );
}
