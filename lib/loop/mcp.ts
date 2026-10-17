import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { contribute, getLesson, lookup, recordOutcomeFromCaller } from "./operations";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "internal error";
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

export function createLedgerMcpServer(): McpServer {
  const server = new McpServer({ name: "agent-ledger", version: "0.1.0" });

  server.registerTool(
    "lookup_lessons",
    {
      description: "Rank active lessons for a domain and task description.",
      inputSchema: {
        domain: z.string(),
        task_description: z.string(),
        k: z.number().int().min(1).max(50).optional(),
      },
    },
    async (args) => {
      try {
        return ok(await lookup(args));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "contribute_lesson",
    {
      description: "Persist a run and, when a lesson is included, store or deduplicate it.",
      inputSchema: {
        domain: z.string(),
        task_description: z.string(),
        outcome: z.enum(["success", "failure"]),
        trace: z.array(z.unknown()),
        lesson_text: z.string().optional(),
      },
    },
    async (args) => {
      try {
        return ok(
          await contribute({
            domain: args.domain,
            task_pattern: args.task_description,
            outcome: args.outcome,
            trace: args.trace,
            lesson: args.lesson_text ? { lesson_text: args.lesson_text } : undefined,
          })
        );
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "get_lesson",
    {
      description: "Read one lesson, its criteria, warnings, and application history.",
      inputSchema: { lesson_id: z.uuid() },
    },
    async (args) => {
      try {
        return ok(await getLesson(args));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "record_outcome",
    {
      description:
        "Verify a run with the evaluator and record that result. Ignores any client-supplied success value.",
      inputSchema: {
        application_id: z.uuid(),
        run_id: z.uuid(),
      },
    },
    async (args) => {
      try {
        return ok(await recordOutcomeFromCaller(args));
      } catch (error) {
        return fail(error);
      }
    }
  );

  return server;
}
