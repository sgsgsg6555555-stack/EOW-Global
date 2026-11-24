-- EOW 蓝 V 认证与一对一通话基础设施（增量迁移）
-- 在 Supabase SQL Editor 执行前请先创建数据库备份。
-- 本脚本不会删除现有表或用户数据；只增加字段、索引、RPC 与 RLS 策略。
begin;

-- 一、统一蓝 V 申请字段。原始表使用 reason / proof_url；
-- 前端附加真实姓名、申请类型和审核备注字段。
alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz;

alter table public.eow_verification_applications
  add column if not exists real_name text,
  add column if not exists application_type text,
  add column if not exists admin_note text,
  add column if not exists proof_url text;

create unique index if not exists eow_one_pending_verification_per_user
  on public.eow_verification_applications(user_id)
  where status = 'pending';

-- 普通用户不能通过 profiles 自更新给自己添加/移除蓝 V。
create or replace function public.eow_guard_profile_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.is_verified is distinct from old.is_verified
      or new.verified_at is distinct from old.verified_at)
     and not coalesce(public.eow_is_admin(), false) then
    raise exception 'Only an EOW administrator can change verification status';
  end if;
  return new;
end;
$$;

drop trigger if exists eow_guard_profile_verification on public.profiles;
create trigger eow_guard_profile_verification
before update on public.profiles
for each row execute function public.eow_guard_profile_verification();

-- 审核状态与用户资料标记在同一事务中更新。
create or replace function public.eow_admin_review_verification(
  p_application_id uuid,
  p_status text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is null or not coalesce(public.eow_is_admin(), false) then
    raise exception 'Administrator permission required';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  update public.eow_verification_applications
     set status = p_status,
         admin_note = nullif(left(coalesce(p_admin_note, ''), 1000), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_application_id
     and status = 'pending'
   returning user_id into v_user_id;

  if v_user_id is null then
    raise exception 'Application not found or already reviewed';
  end if;

  update public.profiles
     set is_verified = (p_status = 'approved'),
         verified_at = case when p_status = 'approved' then now() else null end
   where id = v_user_id;
end;
$$;

revoke all on function public.eow_admin_review_verification(uuid, text, text) from public, anon;
grant execute on function public.eow_admin_review_verification(uuid, text, text) to authenticated;

-- 二、通话会话。第一版仅允许已互相接受的好友发起一对一呼叫。
create table if not exists public.eow_calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio','video')),
  status text not null default 'ringing'
    check (status in ('ringing','accepted','rejected','missed','ended','failed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  constraint eow_calls_not_self check (caller_id <> callee_id)
);
create index if not exists eow_calls_caller_created_idx
  on public.eow_calls(caller_id, created_at desc);
create index if not exists eow_calls_callee_created_idx
  on public.eow_calls(callee_id, created_at desc);

alter table public.eow_calls enable row level security;
revoke all on public.eow_calls from anon, authenticated;
grant select on public.eow_calls to authenticated;

drop policy if exists eow_calls_read_participant on public.eow_calls;
create policy eow_calls_read_participant
on public.eow_calls for select to authenticated
using (auth.uid() = caller_id or auth.uid() = callee_id);

-- 只能通过以下 RPC 创建/改变呼叫状态，客户端不能直接伪造参与者或状态。
create or replace function public.eow_start_call(p_callee_id uuid, p_call_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_call_id uuid;
begin
  if v_caller is null then raise exception '请先登录'; end if;
  if p_callee_id is null or p_callee_id = v_caller then raise exception '呼叫对象无效'; end if;
  if p_call_type not in ('audio','video') then raise exception '通话类型无效'; end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = v_caller and f.addressee_id = p_callee_id)
        or (f.requester_id = p_callee_id and f.addressee_id = v_caller))
  ) then
    raise exception '目前仅支持呼叫已成为好友的用户';
  end if;

  if exists (
    select 1 from public.eow_calls c
    where c.status in ('ringing','accepted')
      and c.created_at > now() - interval '2 minutes'
      and (c.caller_id in (v_caller,p_callee_id) or c.callee_id in (v_caller,p_callee_id))
  ) then
    raise exception '你或对方正在通话中，请稍后再试';
  end if;

  if (select count(*) from public.eow_calls c
      where c.caller_id = v_caller
        and c.created_at > now() - interval '5 minutes') >= 10 then
    raise exception '呼叫过于频繁，请稍后再试';
  end if;

  insert into public.eow_calls(caller_id,callee_id,call_type)
  values(v_caller,p_callee_id,p_call_type)
  returning id into v_call_id;
  return v_call_id;
end;
$$;

create or replace function public.eow_respond_call(p_call_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '请先登录'; end if;
  if p_response not in ('accepted','rejected') then raise exception '响应状态无效'; end if;

  update public.eow_calls
     set status = case when p_response = 'accepted' then 'accepted' else 'rejected' end,
         answered_at = case when p_response = 'accepted' then now() else null end,
         ended_at = case when p_response = 'rejected' then now() else null end,
         end_reason = case when p_response = 'rejected' then 'rejected' else null end
   where id = p_call_id
     and callee_id = v_user
     and status = 'ringing'
     and created_at > now() - interval '45 seconds';

  if not found then raise exception '来电已过期或无权响应'; end if;
end;
$$;

create or replace function public.eow_end_call(p_call_id uuid, p_reason text default 'hangup')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if p_reason not in ('hangup','missed','failed','network_lost') then
    raise exception '结束原因无效';
  end if;

  update public.eow_calls
     set status = case when p_reason = 'missed' then 'missed'
                       when p_reason = 'failed' then 'failed'
                       else 'ended' end,
         ended_at = now(),
         end_reason = p_reason
   where id = p_call_id
     and (caller_id = auth.uid() or callee_id = auth.uid())
     and status in ('ringing','accepted');

  if not found then raise exception '通话不存在、已结束或无权操作'; end if;
end;
$$;

create or replace function public.eow_expire_incoming_calls()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  update public.eow_calls
     set status = 'missed', ended_at = now(), end_reason = 'timeout'
   where callee_id = auth.uid()
     and status = 'ringing'
     and created_at <= now() - interval '45 seconds';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.eow_start_call(uuid,text) from public, anon;
revoke all on function public.eow_respond_call(uuid,text) from public, anon;
revoke all on function public.eow_end_call(uuid,text) from public, anon;
revoke all on function public.eow_expire_incoming_calls() from public, anon;
grant execute on function public.eow_start_call(uuid,text) to authenticated;
grant execute on function public.eow_respond_call(uuid,text) to authenticated;
grant execute on function public.eow_end_call(uuid,text) to authenticated;
grant execute on function public.eow_expire_incoming_calls() to authenticated;

-- 三、WebRTC 信令只走 Supabase 私有 Realtime Broadcast，不落公开业务表。
-- 频道 topic 格式：eow-call:<call UUID>；频道必须以 private:true 订阅。
drop policy if exists eow_call_signal_receive on realtime.messages;
create policy eow_call_signal_receive
on realtime.messages for select to authenticated
using (
  exists (
    select 1 from public.eow_calls c
    where c.id::text = split_part(realtime.topic(), ':', 2)
      and (c.caller_id = auth.uid() or c.callee_id = auth.uid())
      and c.status in ('ringing','accepted')
  )
);

drop policy if exists eow_call_signal_send on realtime.messages;
create policy eow_call_signal_send
on realtime.messages for insert to authenticated
with check (
  exists (
    select 1 from public.eow_calls c
    where c.id::text = split_part(realtime.topic(), ':', 2)
      and (c.caller_id = auth.uid() or c.callee_id = auth.uid())
      and c.status in ('ringing','accepted')
  )
);

-- 启用通话会话表的 Postgres Changes，以便接收方收到来电提醒。
do $
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='eow_calls') then
    alter publication supabase_realtime add table public.eow_calls;
  end if;
end $;

commit;

-- 执行后可检查：
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='eow_verification_applications';
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='eow_calls';
