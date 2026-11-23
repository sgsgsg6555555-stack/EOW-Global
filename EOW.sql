-- EOW 数据库升级脚本（Supabase / PostgreSQL）
-- 执行前请先在 Supabase Dashboard -> Database -> Backups 创建备份。
-- 本脚本不会删除现有表或现有用户数据。请在 SQL Editor 中一次性执行。
begin;

-- 1. 注册成功后自动创建 profiles 行，避免注册后个人主页没有资料记录。
create or replace function public.eow_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_username text;
begin
  v_base := lower(regexp_replace(split_part(coalesce(new.email, 'eowuser'), '@', 1), '[^a-z0-9_]', '', 'g'));
  if v_base = '' then v_base := 'eowuser'; end if;
  v_username := left(v_base, 24) || '_' || substr(replace(new.id::text, '-', ''), 1, 6);

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, coalesce(nullif(split_part(coalesce(new.email, 'EOW 用户'), '@', 1), ''), 'EOW 用户'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists eow_on_auth_user_created on auth.users;
create trigger eow_on_auth_user_created
after insert on auth.users
for each row execute procedure public.eow_handle_new_user();

-- 2. 启用 RLS。
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.follows enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;

grant select, insert, update, delete on public.profiles, public.posts, public.comments,
  public.likes, public.follows, public.friendships, public.messages, public.notifications,
  public.communities, public.community_members to authenticated;

-- 3. 清理并重建本项目使用的策略（只影响以下同名 EOW 策略）。
drop policy if exists "eow_profiles_read" on public.profiles;
create policy "eow_profiles_read" on public.profiles for select to authenticated using (true);
drop policy if exists "eow_profiles_update_own" on public.profiles;
create policy "eow_profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "eow_profiles_insert_own" on public.profiles;
create policy "eow_profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "eow_posts_read" on public.posts;
create policy "eow_posts_read" on public.posts for select to authenticated using (true);
drop policy if exists "eow_posts_insert_own" on public.posts;
create policy "eow_posts_insert_own" on public.posts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "eow_posts_update_own" on public.posts;
create policy "eow_posts_update_own" on public.posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "eow_posts_delete_own" on public.posts;
create policy "eow_posts_delete_own" on public.posts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "eow_comments_read" on public.comments;
create policy "eow_comments_read" on public.comments for select to authenticated using (true);
drop policy if exists "eow_comments_insert_own" on public.comments;
create policy "eow_comments_insert_own" on public.comments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "eow_comments_delete_own" on public.comments;
create policy "eow_comments_delete_own" on public.comments for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "eow_likes_read" on public.likes;
create policy "eow_likes_read" on public.likes for select to authenticated using (true);
drop policy if exists "eow_likes_insert_own" on public.likes;
create policy "eow_likes_insert_own" on public.likes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "eow_likes_delete_own" on public.likes;
create policy "eow_likes_delete_own" on public.likes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "eow_follows_read" on public.follows;
create policy "eow_follows_read" on public.follows for select to authenticated using (true);
drop policy if exists "eow_follows_insert_own" on public.follows;
create policy "eow_follows_insert_own" on public.follows for insert to authenticated with check (auth.uid() = follower_id and follower_id <> following_id);
drop policy if exists "eow_follows_delete_own" on public.follows;
create policy "eow_follows_delete_own" on public.follows for delete to authenticated using (auth.uid() = follower_id);

drop policy if exists "eow_friendships_read_participant" on public.friendships;
create policy "eow_friendships_read_participant" on public.friendships for select to authenticated using (auth.uid() = requester_id or auth.uid() = addressee_id);
drop policy if exists "eow_friendships_request_self" on public.friendships;
create policy "eow_friendships_request_self" on public.friendships for insert to authenticated with check (auth.uid() = requester_id and requester_id <> addressee_id);
drop policy if exists "eow_friendships_update_addressee" on public.friendships;
create policy "eow_friendships_update_addressee" on public.friendships for update to authenticated using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);
drop policy if exists "eow_friendships_delete_participant" on public.friendships;
create policy "eow_friendships_delete_participant" on public.friendships for delete to authenticated using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "eow_messages_read_participant" on public.messages;
create policy "eow_messages_read_participant" on public.messages for select to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "eow_messages_send_self" on public.messages;
create policy "eow_messages_send_self" on public.messages for insert to authenticated with check (auth.uid() = sender_id and sender_id <> receiver_id);

drop policy if exists "eow_notifications_read_recipient" on public.notifications;
create policy "eow_notifications_read_recipient" on public.notifications for select to authenticated using (auth.uid() = recipient_id);
drop policy if exists "eow_notifications_update_recipient" on public.notifications;
create policy "eow_notifications_update_recipient" on public.notifications for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
drop policy if exists "eow_notifications_insert_actor" on public.notifications;
create policy "eow_notifications_insert_actor" on public.notifications for insert to authenticated with check (auth.uid() = actor_id);

drop policy if exists "eow_communities_read" on public.communities;
create policy "eow_communities_read" on public.communities for select to authenticated using (true);
drop policy if exists "eow_communities_insert_owner" on public.communities;
create policy "eow_communities_insert_owner" on public.communities for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "eow_communities_update_owner" on public.communities;
create policy "eow_communities_update_owner" on public.communities for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "eow_communities_delete_owner" on public.communities;
create policy "eow_communities_delete_owner" on public.communities for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists "eow_members_read" on public.community_members;
create policy "eow_members_read" on public.community_members for select to authenticated using (true);
drop policy if exists "eow_members_join_self" on public.community_members;
create policy "eow_members_join_self" on public.community_members for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "eow_members_leave_self" on public.community_members;
create policy "eow_members_leave_self" on public.community_members for delete to authenticated using (auth.uid() = user_id);

-- 4. 建立头像与动态媒体桶。若已存在则不覆盖原设置。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('posts', 'posts', true, 31457280, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

drop policy if exists "eow_public_media_read" on storage.objects;
create policy "eow_public_media_read" on storage.objects for select using (bucket_id in ('avatars','posts'));
drop policy if exists "eow_media_upload_own_folder" on storage.objects;
create policy "eow_media_upload_own_folder" on storage.objects for insert to authenticated
with check (bucket_id in ('avatars','posts') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "eow_media_update_own_folder" on storage.objects;
create policy "eow_media_update_own_folder" on storage.objects for update to authenticated
using (bucket_id in ('avatars','posts') and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id in ('avatars','posts') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "eow_media_delete_own_folder" on storage.objects;
create policy "eow_media_delete_own_folder" on storage.objects for delete to authenticated
using (bucket_id in ('avatars','posts') and (storage.foldername(name))[1] = auth.uid()::text);

-- 5. 新增动态/关注/私信通知。仅在新增记录时触发，不会改动历史数据。
create or replace function public.eow_create_activity_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_actor uuid;
  v_type text;
  v_content text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    v_actor := coalesce((to_jsonb(new)->>'user_id')::uuid, (to_jsonb(new)->>'sender_id')::uuid, (to_jsonb(new)->>'follower_id')::uuid);
  end if;

  if tg_table_name = 'likes' then
    select user_id into v_recipient from public.posts where id = new.post_id;
    v_type := 'like'; v_content := '赞了你的动态';
  elsif tg_table_name = 'comments' then
    select user_id into v_recipient from public.posts where id = new.post_id;
    v_type := 'comment'; v_content := '评论了你的动态：' || left(coalesce(new.content,''), 100);
  elsif tg_table_name = 'follows' then
    v_recipient := new.following_id;
    v_type := 'follow'; v_content := '关注了你';
    v_actor := new.follower_id;
  elsif tg_table_name = 'messages' then
    v_recipient := new.receiver_id;
    v_type := 'message'; v_content := '给你发送了一条私信';
    v_actor := new.sender_id;
  elsif tg_table_name = 'friendships' then
    if tg_op = 'UPDATE' and new.status = 'accepted' then
      v_recipient := new.requester_id;
      v_type := 'friend_accepted'; v_content := '接受了你的好友申请';
      v_actor := new.addressee_id;
    else
      v_recipient := new.addressee_id;
      v_type := 'friend_request'; v_content := '向你发送了好友申请';
      v_actor := new.requester_id;
    end if;
  else
    return new;
  end if;

  if v_recipient is not null and v_actor is not null and v_recipient <> v_actor then
    insert into public.notifications (recipient_id, actor_id, type, content, is_read, created_at)
    values (v_recipient, v_actor, v_type, v_content, false, now());
  end if;
  return new;
end;
$$;

drop trigger if exists eow_notify_like on public.likes;
create trigger eow_notify_like after insert on public.likes for each row execute procedure public.eow_create_activity_notification();
drop trigger if exists eow_notify_comment on public.comments;
create trigger eow_notify_comment after insert on public.comments for each row execute procedure public.eow_create_activity_notification();
drop trigger if exists eow_notify_follow on public.follows;
create trigger eow_notify_follow after insert on public.follows for each row execute procedure public.eow_create_activity_notification();
drop trigger if exists eow_notify_message on public.messages;
create trigger eow_notify_message after insert on public.messages for each row execute procedure public.eow_create_activity_notification();
drop trigger if exists eow_notify_friend_request on public.friendships;
create trigger eow_notify_friend_request after insert on public.friendships for each row execute procedure public.eow_create_activity_notification();
drop trigger if exists eow_notify_friend_accepted on public.friendships;
create trigger eow_notify_friend_accepted after update of status on public.friendships for each row
when (new.status = 'accepted' and old.status is distinct from new.status)
execute procedure public.eow_create_activity_notification();

commit;

-- 执行完成后，可运行以下检查：
-- select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
-- select id, name, public from storage.buckets where id in ('avatars','posts');
