-- QuillCast — initial schema migration
-- Run via: supabase db push

-- profiles: extends auth.users
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  default_language text default 'en',
  default_intensity text default 'light' check (default_intensity in ('verbatim', 'light', 'full')),
  default_stt_engine text check (default_stt_engine in ('openai', 'sarvam', 'elevenlabs', 'whisper_local')),
  default_llm_model text,
  ui_locale text default 'en',
  tier text default 'free' check (tier in ('free', 'starter', 'pro', 'pro_plus_local')),
  subscription_status text default 'active',
  subscription_provider text check (subscription_provider in ('razorpay', 'lemonsqueezy')),
  subscription_ref text,
  created_at timestamptz default now()
);

-- notes
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  title text,
  transcript_raw text,
  summary text,
  audio_storage_path text,
  audio_duration_sec int check (audio_duration_sec >= 0),
  language_detected text,
  language_output text,
  intensity text check (intensity in ('verbatim', 'light', 'full')),
  stt_engine text check (stt_engine in ('openai', 'sarvam', 'elevenlabs', 'whisper_local')),
  llm_model text,
  status text default 'pending' check (status in ('pending', 'transcribing', 'cleaning', 'ready', 'failed')),
  error text,
  cost_usd numeric(10, 6) check (cost_usd >= 0),
  tags text[] default '{}',
  is_starred boolean default false,
  is_archived boolean default false,
  created_at timestamptz default now(),
  ready_at timestamptz
);

create index notes_user_created_idx on public.notes (user_id, created_at desc);
create index notes_tags_idx on public.notes using gin (tags);
create index notes_status_idx on public.notes (status);

-- usage: per-user per-month minute tracking
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  minutes_used numeric(10, 2) default 0 check (minutes_used >= 0),
  notes_count int default 0 check (notes_count >= 0),
  cost_usd numeric(10, 6) default 0 check (cost_usd >= 0),
  updated_at timestamptz default now(),
  unique (user_id, month)
);

-- payment_events: audit log — immutable
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  provider text not null check (provider in ('razorpay', 'lemonsqueezy')),
  event_type text not null,
  external_event_id text unique, -- idempotency key
  payload jsonb,
  created_at timestamptz default now()
);

create index payment_events_user_idx on public.payment_events (user_id, created_at desc);
create index payment_events_ext_id_idx on public.payment_events (external_event_id);

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.usage enable row level security;
alter table public.payment_events enable row level security;

-- RLS policies: users can only read/write their own data
create policy "profiles: owner full access"
  on public.profiles for all
  using (auth.uid() = id);

create policy "notes: owner full access"
  on public.notes for all
  using (auth.uid() = user_id);

create policy "usage: owner read-only"
  on public.usage for select
  using (auth.uid() = user_id);

-- payment_events: users can read their own events; insert is service-role only
create policy "payment_events: owner read"
  on public.payment_events for select
  using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
