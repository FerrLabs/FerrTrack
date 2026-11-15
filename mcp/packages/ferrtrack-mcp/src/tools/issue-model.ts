import { z } from 'zod';

export const ISSUE_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;

export interface Issue {
  id: string;
  ref: string;
  project_id: string;
  title: string;
  body: string;
  status: string;
  kind: string;
  priority: (typeof ISSUE_PRIORITIES)[number];
  due_date: string | null;
  estimate: number | null;
  labels: string[];
  assignee_id: string | null;
  author_id: string;
  cycle_id: string | null;
  milestone_id: string | null;
  parent_id: string | null;
  parent_ref?: string;
  created_at: string;
  updated_at: string;
}

export const prioritySchema = z
  .enum(ISSUE_PRIORITIES)
  .describe('Issue priority: none (default), low, medium, high or urgent.');

export const estimateSchema = z
  .number()
  .int()
  .min(0)
  .max(1000)
  .describe('Effort estimate as an integer from 0 to 1000 (e.g. story points).');

export const dueDateSchema = z.iso.date().describe('Due date as YYYY-MM-DD.');

export const parentIdSchema = z
  .string()
  .uuid()
  .describe('UUID (not the ref) of the parent issue; the issue becomes a sub-issue.');
