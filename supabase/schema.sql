-- Run this script in Supabase SQL Editor.
-- This version is for secret-word login handled by your Next.js server.
-- Browser clients never query Supabase directly.

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  content text not null,
  sender_email text not null,
  reply_to_id bigint,
  is_pinned boolean not null default false,
  pinned_at timestamptz,
  edited_at timestamptz,
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint messages_non_empty check (char_length(trim(content)) between 1 and 1000),
  constraint messages_sender_non_empty check (char_length(trim(sender_email)) between 1 and 40)
);

alter table public.messages
  add column if not exists reply_to_id bigint;
alter table public.messages
  add column if not exists is_pinned boolean not null default false;
alter table public.messages
  add column if not exists pinned_at timestamptz;
alter table public.messages
  add column if not exists edited_at timestamptz;
alter table public.messages
  add column if not exists is_deleted boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_reply_to_id_fkey'
  ) then
    alter table public.messages
      add constraint messages_reply_to_id_fkey
      foreign key (reply_to_id)
      references public.messages(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.typing_status (
  sender_name text primary key,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint typing_sender_non_empty check (char_length(trim(sender_name)) between 1 and 40)
);

create table if not exists public.message_reads (
  message_id bigint not null references public.messages(id) on delete cascade,
  reader_name text not null,
  seen_at timestamptz not null default timezone('utc', now()),
  primary key (message_id, reader_name),
  constraint message_reads_reader_non_empty check (char_length(trim(reader_name)) between 1 and 40)
);

create index if not exists idx_messages_created_at on public.messages(created_at);
create index if not exists idx_messages_pinned_at on public.messages(is_pinned, pinned_at desc);
create index if not exists idx_message_reads_message_id on public.message_reads(message_id);
create index if not exists idx_typing_status_updated_at on public.typing_status(updated_at desc);

alter table public.messages enable row level security;
alter table public.typing_status enable row level security;
alter table public.message_reads enable row level security;

-- Remove old email-auth policies if you previously ran an older version.
drop policy if exists "Couple can read messages" on public.messages;
drop policy if exists "Couple can send messages" on public.messages;

do $$
begin
  if to_regclass('public.couple_profiles') is not null then
    drop policy if exists "Couple can read profiles" on public.couple_profiles;
    drop policy if exists "Couple can insert self profile" on public.couple_profiles;
  end if;
end $$;

-- Optional cleanup for old setup.
drop function if exists public.is_couple_member();
drop table if exists public.couple_profiles;
