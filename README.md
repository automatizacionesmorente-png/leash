# Leash

**Let AI agents shop. On your terms.**

AI agents can now buy things for you. The hard part is not the payment, it is trust: how much may the agent spend, where, and when should it ask first? Leash answers that.

1. **Write your rules in plain words.** "Up to $60 a week on groceries and $200 a month overall. Never gambling or crypto. Ask me before anything over $30."
2. **Leash turns them into a policy in code.** Gemini drafts it, a strict schema validates it, and code (not the model) writes back what will be enforced, so you confirm exactly that. Anything it cannot express is flagged, never guessed.
3. **Link your PayPal once.** A PayPal billing agreement (Vault v3, "save without purchase").
4. **Any agent pays only through Leash**, over MCP or a plain REST call. Every purchase gets one of three answers:
   - **allow**: charged right away with PayPal (Orders v2 on the saved account);
   - **ask**: waits for your tap on your phone;
   - **deny**: blocked, with the reason the agent can read.

The model never decides whether money moves. It only translates your words; a deterministic engine enforces them.

## Why it is safe

- **Deterministic rules engine** (`lib/rules/evaluate.ts`): a pure function, money as integer cents, rolling day/week/month budgets.
- **Property-based tests** (fast-check, 400 runs per property): no sequence of allowed purchases ever exceeds a budget; a blocked category is always denied; approving never bypasses a hard rule; and more. Mutation checks confirmed the tests catch a broken budget.
- **No race between agents**: every decision runs in one database transaction holding the wallet's row lock, so two agents buying at once cannot overspend together.
- **Approval re-checks the rules**: a purchase you approve later is evaluated again against your current rules before any charge.
- **Idempotent charges**: every PayPal call carries a `PayPal-Request-Id` tied to the purchase, so a retry can never pay twice.
- **Agents only hold a scoped key** (`lsh_…`), never your PayPal credentials.
- **Public demo, capped model calls**: calls to the model are limited per visitor and overall, so nobody can drain the API quota.

## Try to break it

Step 4 in the app simulates an agent that has been fully taken over by a prompt injection. It sends five malicious purchases through the same path every agent uses: draining the account, disguising crypto as groceries, hiding a huge order inside a trusted shop, staying just under the approval limit, and inventing a harmless-looking shop. The code blocks them or holds them for your tap, whatever the model believed.

**What Leash does not claim.** The merchant and category are what the agent says they are, so a hijacked agent can lie about them. That is why the limits do not depend on the label: a lie can only move money inside a budget you set, a shop never used before waits for you, and anything over your ask limit waits for you. The worst case is known in advance and it is the number you chose.

## Connect an agent

MCP (Claude Desktop, Cursor, any MCP client), stateless Streamable HTTP:

```json
{
  "mcpServers": {
    "leash": {
      "url": "https://YOUR-DEPLOYMENT/api/mcp",
      "headers": { "Authorization": "Bearer lsh_..." }
    }
  }
}
```

Tools: `get_spending_rules`, `buy`, `purchase_status`.

REST:

```bash
curl -X POST https://YOUR-DEPLOYMENT/api/agent/purchase \
  -H "Authorization: Bearer lsh_..." -H "content-type: application/json" \
  -d '{"merchant":"FreshMart","category":"groceries","amount":24.5,"description":"Veggie box"}'
```

The app also includes a demo shopping agent (Gemini function calling over a small pretend marketplace) so you can watch rules work end to end.

## Run it

Requirements: Node 20+, a Postgres database (Neon works), a PayPal sandbox app, a Gemini API key.

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run db:setup
npm run dev
```

```bash
npm test        # rules engine properties
```

## Stack

Next.js 16, React 19, Tailwind 4, PayPal REST (Vault v3 + Orders v2, sandbox), Gemini, Postgres (Neon), Model Context Protocol SDK, zod, Vitest + fast-check.

## License

MIT
