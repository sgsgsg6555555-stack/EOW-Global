-- EOW 蓝 V 状态安全升级
-- 在 Supabase Dashboard -> SQL Editor 执行；执行前先备份。
begin;

alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz;

-- 用户可读取公开认证标记，但不能自行修改。
create or replace function public.eow_guard_profile_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.is_verified is distinct from old.is_verified
      or new.verified_at is distinct from old.verified_at)
     and not public.eow_is_admin() then
    raise exception 'Only an active EOW administrator can change verification status';
  end if;
  return new;
end;
$$;

drop trigger if exists eow_guard_profile_verification on public.profiles;
create trigger eow_guard_profile_verification
before update on public.profiles
for each row execute function public.eow_guard_profile_verification();

commit;

-- 验证
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema='public' and table_name='profiles'
-- and column_name in ('is_verified','verified_at');
