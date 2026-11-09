import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { BuyInput, buy, rulesFor, status } from "@/lib/agent-tools";
import { TOO_MANY, agentCallAllowed } from "@/lib/rate-limit";
import { agentWallet } from "@/lib/session";
import type { Wallet } from "@/lib/wallet";

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

function server(w: Wallet) {
  const s = new McpServer({ name: "leash", version: "1.0.0" });
  s.registerTool("get_spending_rules", {
    description: "Read the owner's spending rules before shopping, so you only propose purchases that can be paid.",
  }, async () => text(rulesFor(w)));
  s.registerTool("buy", {
    description: "Pay for a purchase with the owner's PayPal. Leash checks the owner's rules: the result is paid, pending (the owner must approve; check again with purchase_status), or denied with the reasons.",
    inputSchema: BuyInput.shape,
  }, async (input) => text(await buy(w, "mcp-agent", input)));
  s.registerTool("purchase_status", {
    description: "Check a purchase that was waiting for the owner's approval.",
    inputSchema: { id: z.string().uuid() },
  }, async ({ id }) => text(await status(w, id)));
  return s;
}

async function handle(req: Request) {
  const w = await agentWallet(req);
  if (!w) return Response.json({ error: "Missing or wrong agent key." }, { status: 401 });
  if (!(await agentCallAllowed(req))) return Response.json({ error: TOO_MANY }, { status: 429 });
  // Stateless: one server per request, so it runs anywhere a function does.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server(w).connect(transport);
  return transport.handleRequest(req);
}

export { handle as POST, handle as GET, handle as DELETE };
