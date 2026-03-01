-- Run this script in Supabase SQL Editor.
-- This version is for secret-word login handled by your Next.js server.
-- Browser clients never query Supabase directly.

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  content text not null,
  sender_email text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint messages_non_empty check (char_length(trim(content)) between 1 and 1000),
  constraint messages_sender_non_empty check (char_length(trim(sender_email)) between 1 and 40)
);

alter table public.messages enable row level security;

-- Remove old email-auth policies if you previously ran an older version.
drop policy if exists "Couple can read messages" on public.messages;
drop policy if exists "Couple can send messages" on public.messages;
drop policy if exists "Couple can read profiles" on public.couple_profiles;
drop policy if exists "Couple can insert self profile" on public.couple_profiles;

-- Optional cleanup for old setup.
drop function if exists public.is_couple_member();
drop table if exists public.couple_profiles;
