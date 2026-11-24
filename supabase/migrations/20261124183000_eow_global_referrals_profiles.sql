-- EOW Global: referral attribution and profile localization fields.
-- Additive-only migration. Existing profile and social data is preserved.
alter table public.profiles
  add column if not exists country_code text,
  add column if not exists preferred_language text not null default 'zh-CN',
  add column if not exists interests text[] not null default '{}',
  add column if not exists invite_code text;

update public.profiles
set invite_code = lower(substr(md5(id::text || random()::text || clock_timestamp()::text),1,10))
where invite_code is null;

alter table public.profiles
  alter column invite_code set default lower(substr(md5(random()::text || clock_timestamp()::text),1,10));

create unique index if not exists profiles_invite_code_uidx
  on public.profiles(invite_code);

create table if not exists public.eow_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null unique references auth.users(id) on delete cascade,
  invite_code text not null,
  status text not null default 'registered' check (status in ('registered','activated')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint eow_invites_no_self_invite check (inviter_id <> invitee_id)
);
create index if not exists eow_invites_inviter_created_idx
  on public.eow_invites(inviter_id, created_at desc);
create index if not exists eow_invites_code_idx
  on public.eow_invites(invite_code);

alter table public.eow_invites enable row level security;
drop policy if exists "Invitees can record their own referral" on public.eow_invites;
create policy "Invitees can record their own referral"
  on public.eow_invites for insert to authenticated
  with check (invitee_id = (select auth.uid()) and inviter_id <> (select auth.uid()));
drop policy if exists "Users can read their own referral records" on public.eow_invites;
create policy "Users can read their own referral records"
  on public.eow_invites for select to authenticated
  using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));
grant select, insert on public.eow_invites to authenticated;

comment on column public.profiles.country_code is 'ISO 3166-1 alpha-2 country/region code for opt-in discovery matching';
comment on column public.profiles.preferred_language is 'Preferred UI and discovery language tag';
comment on column public.profiles.interests is 'User-selected interest tags for discovery recommendations';
comment on column public.profiles.invite_code is 'Unique personal referral code';
