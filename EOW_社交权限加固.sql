-- EOW 社交权限加固
-- 执行前请在 Supabase Dashboard -> Database -> Backups 创建备份。
-- 本迁移仅收紧社交表权限，不删除业务数据；请在确认后手动执行。
begin;

-- 社区动态只允许社区成员或社区创建者发布。
drop policy if exists "eow_posts_insert_own" on public.posts;
create policy "eow_posts_insert_own" on public.posts
for insert to authenticated
with check (
  auth.uid() = user_id
  and (
    community_id is null
    or exists (
      select 1 from public.community_members cm
      where cm.community_id = posts.community_id
        and cm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.communities c
      where c.id = posts.community_id
        and c.owner_id = auth.uid()
    )
  )
);

-- 普通用户只能以 member 身份加入社区；owner 身份必须与 communities.owner_id 一致。
drop policy if exists "eow_members_join_self" on public.community_members;
create policy "eow_members_join_self" on public.community_members
for insert to authenticated
with check (
  auth.uid() = user_id
  and (
    role = 'member'
    or (
      role = 'owner'
      and exists (
        select 1 from public.communities c
        where c.id = community_members.community_id
          and c.owner_id = auth.uid()
      )
    )
  )
);

-- 社区创建者不能通过删除自己的成员记录来丢失管理身份。
drop policy if exists "eow_members_leave_self" on public.community_members;
create policy "eow_members_leave_self" on public.community_members
for delete to authenticated
using (
  auth.uid() = user_id
  and not exists (
    select 1 from public.communities c
    where c.id = community_members.community_id
      and c.owner_id = auth.uid()
  )
);

-- 用户只能将自己的通知标记为已读，不能改写通知内容或归属。
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

commit;

-- 执行后建议验证：
-- 1. 普通成员不能插入 role='owner' 的成员记录。
-- 2. 非成员不能为 community_id 非空的社区发布动态。
-- 3. 社区创建者不能退出自己的 owner 成员身份。
-- 4. 普通用户只能更新自己通知的 is_read 字段。
