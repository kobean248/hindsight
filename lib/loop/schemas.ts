import { z } from "zod";
import { LedgerError } from "./errors";

const uuid = z.uuid();

export const lookupSchema = z.object({
  domain: z.string().trim().min(1),
  task_description: z.string().trim().min(1),
  k: z.number().int().min(1).max(50).optional(),
  run_id: uuid.optional(),
});

export const lessonDraftSchema = z.object({
  lesson_text: z.string().nullable().optional(),
  root_cause: z.string().nullable().optional(),
  success_criteria: z.string().nullable().optional(),
  risk_warnings: z.array(z.string()).optional(),
});

export const contributeSchema = z.object({
  domain: z.string().trim().min(1),
  task_pattern: z.string().trim().min(1),
  outcome: z.enum(["success", "failure"]),
  trace: z.array(z.unknown()),
  lesson: lessonDraftSchema.optional(),
  task_id: z.string().trim().min(1).optional(),
  agent_id: z.string().trim().min(1).optional(),
  existing_run_id: uuid.optional(),
});

export const contributeToolSchema = z.object({
  domain: z.string().trim().min(1),
  task_description: z.string().trim().min(1),
  outcome: z.enum(["success", "failure"]),
  trace: z.array(z.unknown()),
  lesson_text: z.string().optional(),
});

export const lessonIdSchema = z.object({
  lesson_id: uuid,
});

export const runIdSchema = z.object({
  run_id: uuid,
});

export const dashboardSchema = z.object({
  domain: z.string().trim().min(1).optional(),
  run_status: z
    .enum(["queued", "running", "succeeded", "failed", "cancelled", "timed_out"])
    .optional(),
});

/** Unknown keys such as `success` are stripped. They are never read. */
export const recordOutcomeSchema = z.object({
  application_id: uuid,
  run_id: uuid,
});

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new LedgerError(400, message);
  }
  return parsed.data;
}
