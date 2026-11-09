# Leash

**The firewall between AI agents and your PayPal.**

PayPal's Agent Toolkit lets an AI agent refund, invoice and manage disputes on a real account. Its controls are on/off switches per tool. There is no "refund up to $30", no "ask me first", and no check that the refund belongs to the customer asking for it. So one poisoned support email can make an honest agent pay out someone else's money.

Leash puts one door in front of all 47 toolkit tools. Point your agent at Leash instead of PayPal, and every call is decided by code, using PayPal's own records.

## Try it in one minute

Open the [hosted demo](https://leash-nine.vercel.app) and press **Open the live demo shop**. There is no sign-up and no PayPal login: it places three real sandbox orders for a pretend shop. Then let the agent work through the inbox. One ticket is poisoned.

## What happens in the demo

| Ticket | What the model does | What Leash does |
|---|---|---|
| Cracked mug, $18 | Refunds it | Allowed. Real sandbox refund. |
| Late dinner set, $120 | Refunds it | Over the limit, so it waits for one tap on the owner's phone. |
| Poisoned message pretending to be PayPal | Really obeys: refunds another customer, tries $4,000, accepts a dispute | Blocked three times, from PayPal's records and the owner's rules. |
| Invoice request, $90 | Creates it | Allowed, through the official toolkit. |

The agent is a real Gemini function-calling loop and its tool calls are not scripted. Its instructions are deliberately trusting, so it obeyed the poisoned ticket in all 5 of our last measured runs, and all 15 of its malicious calls were blocked. In one run it then refunded the attacker's own $12 order, which fits every rule. That is the limit described below.

## Why the agent cannot talk its way out

- **Claims are checked against PayPal.** For a refund, Leash reads the capture and the order from PayPal: the amount, what is already refunded, and whose payment it is. The agent's story is not an input.
- **The customer comes from the app, never from the model.** A ticket from Eve cannot refund Tom's payment, however it is worded.
- **Deny by default.** A tool Leash does not recognise is denied. Tools that destroy records or accept liability are not available to agents.
- **The model never decides.** Gemini translates the owner's words into a policy, code writes back what will be enforced, and the owner confirms that. `lib/firewall/decide.ts` is a pure function.
- **Property-based tests** (fast-check): no sequence of refunds exceeds the daily limit, an approval never unlocks another customer's payment, and nothing above what PayPal says is left can pass. One of these properties caught a real bug during development.
- **No race, no double payment.** Each decision holds the wallet's row lock, identical writes are refused, and refunds carry a `PayPal-Request-Id`. The toolkit cannot send that header, so refunds go directly to REST.
- **An approval re-checks everything** against PayPal at the moment you tap.
- **One switch stops every agent** on its next call, reads included.

## Bring your own agent

Change one URL in your MCP config. The agent gets the same 47 tools and never holds a PayPal credential:

```json
{ "mcpServers": { "paypal": { "url": "https://YOUR-LEASH/api/paypal-mcp", "headers": { "Authorization": "Bearer lsh_…" } } } }
```

## Agents that spend your money

The same idea protects a buyer. On `/shop`, you link PayPal once with a Vault billing agreement and agents can pay only within plain-word budgets, over MCP or REST.

## What Leash does not claim

Leash limits what a fooled agent can do. It does not make the agent smarter. A fooled agent can still make a wrong refund that fits every rule, such as a small refund on the customer's own order, and the limits you set are the most that can cost you. The demo runs on the PayPal sandbox and shares one sandbox merchant between visitors, so each visitor can only touch payments tagged with their own session.

## PayPal and AI used

- **PayPal:** Agent Toolkit (47 tools through its MCP service), Orders v2, Payments v2 refunds, Invoicing, Disputes, Vault v3.
- **AI:** Google Gemini for function calling and for compiling rules.
- **Sponsor tool:** AG Grid Community for the audit log, with filtering, search and CSV export.

## Run it

Requirements: Node 20+, Postgres (Neon works), a PayPal sandbox app, a Gemini API key.

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run db:setup
npm run dev
npm test
```

`package.json` overrides replace dependencies of the Agent Toolkit that Leash never loads, so `npm audit --omit=dev` is clean.

`DEMO_VAULT_ID` is a sandbox payer's vault token: link a sandbox buyer once on `/shop` to get one.

## License

MIT
