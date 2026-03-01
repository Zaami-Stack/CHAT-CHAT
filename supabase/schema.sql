-- Run this script in the Supabase SQL Editor.
-- It creates a private, two-user chat with strict row-level security.

create table if not exists public.couple_profiles (
  email text primary key,
  created_at timestamptz not null default timezone('utc', now()),
  constraint couple_profiles_valid_email check (position('@' in email) > 1)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  content text not null,
  sender_email text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint messages_non_empty check (char_length(trim(content)) between 1 and 1000)
);

alter table public.couple_profiles enable row level security;
alter table public.messages enable row level security;

create or replace function public.is_couple_member()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.couple_profiles cp
    where lower(cp.email) = lower(coalesce(auth.jwt()->>'email', ''))
  );
$$;

drop policy if exists "Couple can read profiles" on public.couple_profiles;
create policy "Couple can read profiles"
on public.couple_profiles
for select
using (public.is_couple_member());

drop policy if exists "Couple can insert self profile" on public.couple_profiles;
create policy "Couple can insert self profile"
on public.couple_profiles
for insert
with check (
  lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
);

drop policy if exists "Couple can read messages" on public.messages;
create policy "Couple can read messages"
on public.messages
for select
using (public.is_couple_member());

drop policy if exists "Couple can send messages" on public.messages;
create policy "Couple can send messages"
on public.messages
for insert
with check (
  public.is_couple_member()
  and lower(sender_email) = lower(coalesce(auth.jwt()->>'email', ''))
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Replace these with your real email addresses.
insert into public.couple_profiles (email)
values
  ('you@example.com'),
  ('your-gf@example.com')
on conflict (email) do nothing;
