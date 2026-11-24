-- EOW 社区管理功能迁移（可选）
-- 执行前备份。新增公告字段并将成员管理限制为社区创建者。
begin;
alter table public.communities add column if not exists announcement text not null default '';
drop policy if exists "eow_members_join_self" on public.community_members;
drop policy if exists "eow_members_leave_self" on public.community_members;
drop policy if exists eow_members_join_self on public.community_members;
drop policy if exists eow_members_leave_self on public.community_members;
drop policy if exists eow_members_update_roles_owner on public.community_members;
drop policy if exists eow_members_delete_managed on public.community_members;
create policy eow_members_join_self on public.community_members for insert to authenticated with check (auth.uid() = user_id and role = 'member');
create policy eow_members_update_roles_owner on public.community_members for update to authenticated using (exists (select 1 from public.communities c where c.id = community_members.community_id and c.owner_id = auth.uid())) with check (role in ('member','moderator') and exists (select 1 from public.communities c where c.id = community_members.community_id and c.owner_id = auth.uid() and community_members.user_id <> c.owner_id));
create policy eow_members_delete_managed on public.community_members for delete to authenticated using (user_id <> auth.uid() and exists (select 1 from public.communities c where c.id = community_members.community_id and c.owner_id = auth.uid()));
commit;
-- 说明：只有社区创建者可设置管理员、移除成员；moderator 暂作为展示角色，未授予管理权限。