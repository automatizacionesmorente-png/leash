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
  agent_key text not null unique,
  owner_key text not null unique
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
alter table wallets add column if not exists firewall_policy jsonb;
alter table wallets add column if not exists firewall_text text not null default '';
alter table wallets add column if not exists frozen boolean not null default false;
create table if not exists tickets (
  id text primary key,
  wallet_id text not null references wallets(id) on delete cascade,
  position integer not null,
  customer_name text not null,
  customer_email text not null,
  subject text not null,
  body text not null,
  order_id text,
  capture_id text,
  cents integer,
  status text not null default 'open' check (status in ('open', 'running', 'handled'))
);
create index if not exists tickets_wallet on tickets (wallet_id, position);
create table if not exists agent_actions (
  id text primary key,
  wallet_id text not null references wallets(id) on delete cascade,
  ticket_id text,
  agent text not null,
  tool text not null,
  args jsonb not null,
  customer text,
  cents integer,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  status text not null check (status in ('done', 'pending', 'denied', 'rejected', 'failed')),
  reasons jsonb not null default '[]',
  paypal_ref text,
  decided_at timestamptz
);
create index if not exists agent_actions_wallet on agent_actions (wallet_id, created_at desc);
create table if not exists rate_limits (
  bucket text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
`;
