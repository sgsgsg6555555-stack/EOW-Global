-- Add covering indexes for foreign keys introduced by EOW social extras.
create index if not exists eow_stories_user_created_idx on public.eow_stories(user_id, created_at desc);
create index if not exists eow_saved_posts_post_idx on public.eow_saved_posts(post_id);
create index if not exists eow_poll_votes_option_idx on public.eow_poll_votes(option_id);
create index if not exists eow_poll_votes_user_idx on public.eow_poll_votes(user_id);
create index if not exists eow_events_organizer_idx on public.eow_events(organizer_id);
create index if not exists eow_event_rsvps_user_idx on public.eow_event_rsvps(user_id);
