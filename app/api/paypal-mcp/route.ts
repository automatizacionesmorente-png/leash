import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { callTool, officialToolkit } from "@/lib/firewall/engine";
import { TOO_MANY, agentCallAllowed } from "@/lib/rate-limit";
import { agentWallet } from "@/lib/session";
import type { Wallet } from "@/lib/wallet";

const reply = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

/** PayPal's own Agent Toolkit, tool for tool, except that every call passes through the owner's rules first. */
async function server(w: Wallet) {
  const s = new McpServer({ name: "leash-paypal", version: "1.0.0" });
  for (const tool of (await officialToolkit()).getTools()) {
    s.registerTool(tool.method, { description: tool.description, inputSchema: tool.parameters.shape as never }, (async (args: Record<string, unknown>) => reply(await callTool(w.id, "mcp-agent", { tool: tool.method, args }))) as never);
  }
  return s;
}

async function handle(req: Request) {
  const w = await agentWallet(req);
  if (!w) return Response.json({ error: "Missing or wrong agent key." }, { status: 401 });
  if (!(await agentCallAllowed(req))) return Response.json({ error: TOO_MANY }, { status: 429 });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await (await server(w)).connect(transport);
  return transport.handleRequest(req);
}

export { handle as POST, handle as GET, handle as DELETE };
