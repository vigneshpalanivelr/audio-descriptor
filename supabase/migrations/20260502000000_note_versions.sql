-- Add custom_prompt column to notes (nullable — only set when custom prompt was used)
alter table public.notes add column if not exists custom_prompt text;

-- note_versions: immutable history of every regeneration
create table public.note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references public.notes on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  -- 'custom' allowed here in addition to the three preset intensities
  intensity text check (intensity in ('verbatim', 'light', 'full', 'custom')),
  custom_prompt text,
  summary text not null,
  llm_model text,
  cost_usd numeric(10, 6) check (cost_usd >= 0),
  created_at timestamptz default now()
);

create index note_versions_note_idx on public.note_versions (note_id, created_at desc);

alter table public.note_versions enable row level security;

create policy "note_versions: owner full access"
  on public.note_versions for all
  using (auth.uid() = user_id);
