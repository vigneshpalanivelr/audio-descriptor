-- Migration: audit logging + admin support

-- Add admin flag to profiles
alter table public.profiles
  add column if not exists is_admin boolean default false,
  add column if not exists last_seen_at timestamptz,
  add column if not exists login_count int default 0;

-- audit_logs: immutable event log (no update/delete allowed)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  event_type text not null,
  resource_type text,
  resource_id uuid,
  ip_address text,
  user_agent text,
  -- metadata: safe context only — never store transcripts, emails, or secrets
  metadata jsonb,
  created_at timestamptz default now()
);

-- Indexes for admin dashboard queries
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_event_type_idx on public.audit_logs (event_type);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- user_sessions: tracks login/logout times for admin dashboard
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  -- IST offset is applied at query time (UTC stored, converted in queries)
  logged_in_at timestamptz default now(),
  logged_out_at timestamptz,
  ip_address text,
  user_agent text,
  is_active boolean default true
);

create index user_sessions_user_idx on public.user_sessions (user_id, logged_in_at desc);
create index user_sessions_active_idx on public.user_sessions (is_active) where is_active = true;

-- Enable RLS
alter table public.audit_logs enable row level security;
alter table public.user_sessions enable row level security;

-- audit_logs: only service role can insert; admins can read all; users cannot access
create policy "audit_logs: admin read"
  on public.audit_logs for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- user_sessions: users see own; admins see all
create policy "user_sessions: owner read"
  on public.user_sessions for select
  using (auth.uid() = user_id);

create policy "user_sessions: admin read all"
  on public.user_sessions for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- Function: get live users (active in last 5 minutes)
create or replace function public.get_live_users()
returns table (
  user_id uuid,
  last_seen_at timestamptz,
  -- IST = UTC + 5:30
  last_seen_ist text
)
language sql
security definer
as $$
  select
    p.id as user_id,
    p.last_seen_at,
    to_char(p.last_seen_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS IST') as last_seen_ist
  from public.profiles p
  where p.last_seen_at > now() - interval '5 minutes'
  order by p.last_seen_at desc;
$$;

-- Function: token/cost usage per user for admin dashboard
create or replace function public.get_user_token_usage(since_date date default current_date - 30)
returns table (
  user_id uuid,
  notes_count bigint,
  total_cost_usd numeric,
  avg_cost_per_note numeric
)
language sql
security definer
as $$
  select
    user_id,
    count(*) as notes_count,
    coalesce(sum(cost_usd), 0) as total_cost_usd,
    coalesce(avg(cost_usd), 0) as avg_cost_per_note
  from public.notes
  where created_at >= since_date::timestamptz
    and status = 'ready'
  group by user_id
  order by total_cost_usd desc;
$$;
