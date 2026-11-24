-- EOW 内容举报功能迁移（可选）
-- 执行前请先在 Supabase Dashboard -> Database -> Backups 创建备份。
-- 此迁移只新增举报表与 RLS 策略，不修改或删除现有内容。
begin;

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create unique index if not exists eow_post_reports_unique_reporter_post
  on public.post_reports(post_id, reporter_id);

alter table public.post_reports enable row level security;
revoke all on public.post_reports from anon, authenticated;
grant select, insert, update on public.post_reports to authenticated;

drop policy if exists eow_post_reports_insert_own on public.post_reports;
create policy eow_post_reports_insert_own
on public.post_reports for insert to authenticated
with check (
  auth.uid() = reporter_id
  and exists (
    select 1 from public.posts p
    where p.id::text = post_reports.post_id
      and p.user_id <> auth.uid()
  )
);

drop policy if exists eow_post_reports_read_own on public.post_reports;
create policy eow_post_reports_read_own
on public.post_reports for select to authenticated
using (auth.uid() = reporter_id);

drop policy if exists eow_post_reports_read_admin on public.post_reports;
create policy eow_post_reports_read_admin
on public.post_reports for select to authenticated
using (
  exists (
    select 1 from public.eow_admins a
    where a.user_id = auth.uid() and a.active = true
  )
);

drop policy if exists eow_post_reports_update_admin on public.post_reports;
create policy eow_post_reports_update_admin
on public.post_reports for update to authenticated
using (exists (select 1 from public.eow_admins a where a.user_id = auth.uid() and a.active = true))
with check (exists (select 1 from public.eow_admins a where a.user_id = auth.uid() and a.active = true));

commit;

-- 验证：
-- 1. 用户只能提交自己名下的举报。
-- 2. 用户不能举报自己的动态。
-- 3. 同一用户不能重复举报同一条动态。
-- 4. 只有有效管理员可读取所有举报记录；普通用户只能读取自己的举报。
