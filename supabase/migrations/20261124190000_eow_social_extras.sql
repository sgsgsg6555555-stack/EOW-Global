-- EOW social extras: expiring stories, saved posts, polls and events.
-- Additive only. Existing accounts, posts and social records are preserved.

create table if not exists public.eow_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image','video')),
  caption text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint eow_stories_caption_len check (char_length(caption) <= 500)
);
create index if not exists eow_stories_active_idx on public.eow_stories(expires_at desc, created_at desc);
alter table public.eow_stories enable row level security;
drop policy if exists "Authenticated users read active stories" on public.eow_stories;
create policy "Authenticated users read active stories" on public.eow_stories
  for select to authenticated using (expires_at > now());
drop policy if exists "Users create own stories" on public.eow_stories;
create policy "Users create own stories" on public.eow_stories
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users delete own stories" on public.eow_stories;
create policy "Users delete own stories" on public.eow_stories
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.eow_stories to authenticated;

create table if not exists public.eow_saved_posts (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.eow_saved_posts enable row level security;
drop policy if exists "Users manage own saved posts" on public.eow_saved_posts;
create policy "Users manage own saved posts" on public.eow_saved_posts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.eow_saved_posts to authenticated;

create table if not exists public.eow_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts(id) on delete cascade,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.eow_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.eow_polls(id) on delete cascade,
  option_text text not null check (char_length(option_text) between 1 and 120),
  position integer not null default 0
);
create index if not exists eow_poll_options_poll_idx on public.eow_poll_options(poll_id, position);
create table if not exists public.eow_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.eow_polls(id) on delete cascade,
  option_id uuid not null references public.eow_poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);
alter table public.eow_polls enable row level security;
alter table public.eow_poll_options enable row level security;
alter table public.eow_poll_votes enable row level security;
drop policy if exists "Authenticated users read polls" on public.eow_polls;
create policy "Authenticated users read polls" on public.eow_polls for select to authenticated using (true);
drop policy if exists "Post owners create polls" on public.eow_polls;
create policy "Post owners create polls" on public.eow_polls for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid())));
drop policy if exists "Post owners delete polls" on public.eow_polls;
create policy "Post owners delete polls" on public.eow_polls for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid())));
drop policy if exists "Authenticated users read poll options" on public.eow_poll_options;
create policy "Authenticated users read poll options" on public.eow_poll_options for select to authenticated using (true);
drop policy if exists "Poll owners add options" on public.eow_poll_options;
create policy "Poll owners add options" on public.eow_poll_options for insert to authenticated
  with check (exists (select 1 from public.eow_polls q join public.posts p on p.id=q.post_id where q.id=poll_id and p.user_id=(select auth.uid())));
drop policy if exists "Authenticated users read poll votes" on public.eow_poll_votes;
create policy "Authenticated users read poll votes" on public.eow_poll_votes for select to authenticated using (true);
drop policy if exists "Users vote once on own behalf" on public.eow_poll_votes;
create policy "Users vote once on own behalf" on public.eow_poll_votes for insert to authenticated
  with check (user_id=(select auth.uid()) and exists (select 1 from public.eow_poll_options o where o.id=option_id and o.poll_id=eow_poll_votes.poll_id));
drop policy if exists "Users change own poll vote" on public.eow_poll_votes;
create policy "Users change own poll vote" on public.eow_poll_votes for update to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()) and exists (select 1 from public.eow_poll_options o where o.id=option_id and o.poll_id=eow_poll_votes.poll_id));
grant select, insert, delete on public.eow_polls to authenticated;
grant select, insert on public.eow_poll_options to authenticated;
grant select, insert, update on public.eow_poll_votes to authenticated;

create table if not exists public.eow_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '',
  created_at timestamptz not null default now(),
  constraint eow_events_time_check check (ends_at is null or ends_at > starts_at)
);
create index if not exists eow_events_starts_idx on public.eow_events(starts_at);
create table if not exists public.eow_event_rsvps (
  event_id uuid not null references public.eow_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going' check (status in ('going','interested')),
  created_at timestamptz not null default now(),
  primary key (event_id,user_id)
);
alter table public.eow_events enable row level security;
alter table public.eow_event_rsvps enable row level security;
drop policy if exists "Authenticated users read events" on public.eow_events;
create policy "Authenticated users read events" on public.eow_events for select to authenticated using (true);
drop policy if exists "Users create own events" on public.eow_events;
create policy "Users create own events" on public.eow_events for insert to authenticated with check (organizer_id=(select auth.uid()));
drop policy if exists "Organizers update own events" on public.eow_events;
create policy "Organizers update own events" on public.eow_events for update to authenticated using (organizer_id=(select auth.uid())) with check (organizer_id=(select auth.uid()));
drop policy if exists "Organizers delete own events" on public.eow_events;
create policy "Organizers delete own events" on public.eow_events for delete to authenticated using (organizer_id=(select auth.uid()));
drop policy if exists "Authenticated users read event RSVPs" on public.eow_event_rsvps;
create policy "Authenticated users read event RSVPs" on public.eow_event_rsvps for select to authenticated using (true);
drop policy if exists "Users manage own RSVPs" on public.eow_event_rsvps;
create policy "Users manage own RSVPs" on public.eow_event_rsvps for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select, insert, update, delete on public.eow_events to authenticated;
grant select, insert, update, delete on public.eow_event_rsvps to authenticated;
