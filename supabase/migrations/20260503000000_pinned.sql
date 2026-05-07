-- Add is_pinned flag to notes so users can pin important notes to the top of their list
alter table public.notes add column if not exists is_pinned boolean not null default false;

create index notes_user_pinned_idx on public.notes (user_id, is_pinned desc, created_at desc);
