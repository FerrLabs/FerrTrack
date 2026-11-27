import { ApiRequestError } from '@ferrlabs/mcp-core';

const MESSAGES: Readonly<Record<string, string>> = {
  ORG_ADMIN_REQUIRED:
    'Permanent deletion needs a user who is an organization owner or admin. Organization tokens and connected apps are always refused, whatever their scopes. Authenticate as a user with that role, or ask an owner or admin to delete it.',
  TOKEN_SCOPE_REQUIRED:
    'The token in use lacks the scope required for this deletion. Use a token that grants it.',
  ISSUE_NOT_FOUND: 'Issue not found. Check the ref (e.g. "FT-12"); nothing was deleted.',
  COMMENT_NOT_FOUND:
    'Comment not found on this issue. Check the comment id and issue ref; nothing was deleted.',
  COMMENT_NOT_OWNER:
    'You can only delete your own comments. Organization tokens can only delete comments they posted; an organization owner or admin acting as a user can delete any comment.',
  IDENTITY_PLANE_UNAVAILABLE:
    'The identity service is temporarily unavailable, so the deletion could not be authorized. Nothing was deleted; retry shortly.',
};

export async function withMappedErrors<T>(
  messages: Readonly<Record<string, string>>,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ApiRequestError && error.code !== undefined) {
      const message = messages[error.code];
      if (message !== undefined) {
        throw new Error(`${error.code} (HTTP ${error.status}): ${message}`, { cause: error });
      }
    }
    throw error;
  }
}

export function withDeleteErrors<T>(action: () => Promise<T>): Promise<T> {
  return withMappedErrors(MESSAGES, action);
}
