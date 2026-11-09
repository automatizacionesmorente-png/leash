import { db } from "./db";

const PER_IP = { max: 12, seconds: 60 };
const OVERALL = { max: 300, seconds: 3600 };

async function hits(bucket: string, seconds: number): Promise<number> {
  const { rows } = await db().query(
    `insert into rate_limits (bucket, hits, expires_at) values ($1, 1, now() + make_interval(secs => $2))
     on conflict (bucket) do update set
       hits = case when rate_limits.expires_at < now() then 1 else rate_limits.hits + 1 end,
       expires_at = case when rate_limits.expires_at < now() then excluded.expires_at else rate_limits.expires_at end
     returning hits`,
    [bucket, seconds],
  );
  return rows[0].hits;
}

/** Calls to the model cost real quota and the demo is public, so they are capped per visitor and overall. */
export async function modelCallAllowed(req: Request): Promise<boolean> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const [mine, everyone] = await Promise.all([hits(`ip:${ip}`, PER_IP.seconds), hits("overall", OVERALL.seconds)]);
  return mine <= PER_IP.max && everyone <= OVERALL.max;
}

const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

/** Agents hold a free key on a public demo, so each caller is capped too. */
export async function agentCallAllowed(req: Request): Promise<boolean> {
  const [mine, everyone] = await Promise.all([hits(`agent:${ipOf(req)}`, 60), hits("agent:overall", 3600)]);
  return mine <= 60 && everyone <= 3000;
}

/** Opening the shop spends sandbox balance, so nobody can drain it and break the demo for the judges. */
export async function demoStartAllowed(req: Request): Promise<boolean> {
  const [mine, everyone] = await Promise.all([hits(`start:${ipOf(req)}`, 3600), hits("start:overall", 86_400)]);
  return mine <= 6 && everyone <= 40;
}

export const TOO_MANY = "Too many requests right now. Try again in a minute.";
