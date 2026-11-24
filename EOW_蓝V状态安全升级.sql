-- EOW 蓝 V 状态与审核安全升级
-- 增量变更：不删除或重写任何现有用户数据。
begin;

alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz;

-- 防止普通用户通过 profiles 自身更新策略给自己加蓝 V。
create or replace function public.eow_guard_profile_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.is_verified is distinct from old.is_verified
      or new.verified_at is distinct from old.verified_at)
     and not coalesce(public.is_eow_admin(), false) then
    raise exception 'Only an EOW administrator can change verification status';
  end if;
  return new;
end;
$$;

drop trigger if exists eow_guard_profile_verification on public.profiles;
create trigger eow_guard_profile_verification
before update on public.profiles
for each row execute function public.eow_guard_profile_verification();

-- 由单个受限 RPC 完成审核状态和用户蓝 V 标记，避免前端分两次写入。
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
  if auth.uid() is null or not coalesce(public.is_eow_admin(), false) then
    raise exception 'Administrator permission required';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  update public.eow_verification_applications
     set status = p_status,
         admin_note = nullif(left(coalesce(p_admin_note, ''), 1000), ''),
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

revoke all on function public.eow_admin_review_verification(uuid, text, text) from public;
revoke all on function public.eow_admin_review_verification(uuid, text, text) from anon;
grant execute on function public.eow_admin_review_verification(uuid, text, text) to authenticated;

commit;

-- 检查字段：
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='profiles'
-- and column_name in ('is_verified','verified_at');
