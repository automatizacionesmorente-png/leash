import { cookies } from "next/headers";
import { createWallet, getWallet, walletByAgentKey, type Wallet } from "./wallet";

const COOKIE = "leash_wallet";

/** The owner's wallet, kept in an httpOnly cookie. Each visitor gets their own sandbox wallet. */
export async function ownerWallet(create = false): Promise<Wallet | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  const found = id ? await getWallet(id) : null;
  if (found || !create) return found;
  const w = await createWallet();
  jar.set(COOKIE, w.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 });
  return w;
}

/** Agents authenticate with the wallet's agent key: `Authorization: Bearer lsh_...`. */
export async function agentWallet(req: Request): Promise<Wallet | null> {
  const m = /^Bearer\s+(lsh_[\w-]{20,})$/.exec(req.headers.get("authorization") ?? "");
  return m ? walletByAgentKey(m[1]) : null;
}
