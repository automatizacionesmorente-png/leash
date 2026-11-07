import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export const SCHEMA = `
create table if not exists wallets (
  id text primary key,
  created_at timestamptz not null default now(),
  rules_text text not null default '',
  mandate jsonb,
  vault_id text,
  payer_email text,
  agent_key text not null unique
);
create table if not exists purchases (
  id text primary key,
  wallet_id text not null references wallets(id) on delete cascade,
  agent text not null,
  merchant text not null,
  category text not null,
  amount integer not null check (amount > 0),
  currency text not null,
  description text not null,
  created_at timestamptz not null default now(),
  status text not null check (status in ('paid', 'pending', 'denied', 'rejected', 'failed')),
  reasons jsonb not null default '[]',
  paypal_order_id text,
  decided_at timestamptz
);
create index if not exists purchases_wallet on purchases (wallet_id, created_at desc);
`;
