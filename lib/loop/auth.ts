import { timingSafeEqual } from "node:crypto";

export function mcpUnauthorized(request: Request): Response | null {
  const expected = process.env.MCP_ACCESS_TOKEN;
  if (!expected) {
    return Response.json({ error: "MCP_ACCESS_TOKEN is not configured" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
