import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpUnauthorized } from "../../../lib/loop/auth";
import { createLedgerMcpServer } from "../../../lib/loop/mcp";

export const runtime = "nodejs";

async function handle(request: Request): Promise<Response> {
  const denied = mcpUnauthorized(request);
  if (denied) return denied;
  const server = createLedgerMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
