-- EOW 蓝 V 认证生产修复迁移
-- 已应用于 Supabase EOW 项目；仅增量增加字段、索引和安全 RPC，不删除用户数据。
begin;

alter table public.eow_verification_applications
  add column if not exists proof_url text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

update public.eow_verification_applications
   set proof_url = document_url
 where proof_url is null and document_url is not null;

create index if not exists eow_verification_user_status_created_idx
  on public.eow_verification_applications(user_id, status, created_at desc);

create or replace function public.eow_prevent_duplicate_pending_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    if exists (
      select 1 from public.eow_verification_applications a
      where a.user_id = new.user_id
        and a.status = 'pending'
        and a.id is distinct from new.id
    ) then
      raise exception 'You already have a pending verification application';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists eow_prevent_duplicate_pending_verification
  on public.eow_verification_applications;
create trigger eow_prevent_duplicate_pending_verification
before insert or update of status, user_id
on public.eow_verification_applications
for each row execute function public.eow_prevent_duplicate_pending_verification();

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
declare v_user_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_eow_admin(), false) then
    raise exception 'Administrator permission required';
  end if;
  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  update public.eow_verification_applications
     set status = p_status,
         admin_note = nullif(left(coalesce(p_admin_note, ''), 1000), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_application_id and status = 'pending'
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

commit;
