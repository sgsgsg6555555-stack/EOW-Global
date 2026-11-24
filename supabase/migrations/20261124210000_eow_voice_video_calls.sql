-- EOW secure WebRTC call signaling and unread message alerts
-- Applied to Supabase project tofnewhidtwkxxzlnyjj on 2026-11-24.
-- Preserves existing profiles, friendships, messages and account data.
create table if not exists public.eow_calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','rejected','missed','ended','failed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  constraint eow_calls_distinct_participants check (caller_id <> callee_id)
);
create index if not exists eow_calls_callee_status_idx on public.eow_calls(callee_id,status,created_at desc);
create index if not exists eow_calls_caller_status_idx on public.eow_calls(caller_id,status,created_at desc);
alter table public.eow_calls enable row level security;
drop policy if exists "eow_calls_read_participant" on public.eow_calls;
create policy "eow_calls_read_participant" on public.eow_calls for select to authenticated
using (auth.uid() = caller_id or auth.uid() = callee_id);
grant select on public.eow_calls to authenticated;

create table if not exists public.eow_call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.eow_calls(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('ringing','ready','offer','answer','ice','reject','hangup')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint eow_call_signals_distinct_participants check (sender_id <> receiver_id)
);
create index if not exists eow_call_signals_call_created_idx on public.eow_call_signals(call_id,created_at);
alter table public.eow_call_signals enable row level security;
drop policy if exists "eow_call_signals_read_participant" on public.eow_call_signals;
create policy "eow_call_signals_read_participant" on public.eow_call_signals for select to authenticated
using (auth.uid()=sender_id or auth.uid()=receiver_id);
drop policy if exists "eow_call_signals_insert_sender" on public.eow_call_signals;
create policy "eow_call_signals_insert_sender" on public.eow_call_signals for insert to authenticated
with check (auth.uid()=sender_id and sender_id<>receiver_id and exists(
  select 1 from public.eow_calls c where c.id=call_id and c.status in ('ringing','accepted')
    and ((c.caller_id=sender_id and c.callee_id=receiver_id) or (c.caller_id=receiver_id and c.callee_id=sender_id))
));
drop policy if exists "eow_call_signals_delete_participant" on public.eow_call_signals;
create policy "eow_call_signals_delete_participant" on public.eow_call_signals for delete to authenticated
using (auth.uid()=sender_id or auth.uid()=receiver_id);
grant select,insert,delete on public.eow_call_signals to authenticated;

create or replace function public.eow_start_call(p_callee_id uuid,p_call_type text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_callee_id is null or p_callee_id=auth.uid() then raise exception 'Invalid call recipient'; end if;
  if p_call_type not in ('audio','video') then raise exception 'Invalid call type'; end if;
  if not exists(select 1 from public.friendships f where f.status='accepted'
    and ((f.requester_id=auth.uid() and f.addressee_id=p_callee_id) or (f.requester_id=p_callee_id and f.addressee_id=auth.uid()))) then
    raise exception 'Calls are available to accepted friends only';
  end if;
  if exists(select 1 from public.eow_calls c where c.status in ('ringing','accepted')
    and (c.caller_id in (auth.uid(),p_callee_id) or c.callee_id in (auth.uid(),p_callee_id))) then
    raise exception 'One of the users is already in a call';
  end if;
  insert into public.eow_calls(caller_id,callee_id,call_type) values(auth.uid(),p_callee_id,p_call_type) returning id into v_id;
  return v_id;
end; $$;
create or replace function public.eow_respond_call(p_call_id uuid,p_response text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_response not in ('accepted','rejected') then raise exception 'Invalid call response'; end if;
  update public.eow_calls set status=p_response,answered_at=case when p_response='accepted' then now() else answered_at end,
    ended_at=case when p_response='rejected' then now() else ended_at end
  where id=p_call_id and callee_id=auth.uid() and status='ringing';
  if not found then raise exception 'Call is no longer available'; end if;
end; $$;
create or replace function public.eow_end_call(p_call_id uuid,p_reason text default 'hangup')
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status text;
begin
  v_status=case when p_reason in ('missed','failed','rejected') then p_reason else 'ended' end;
  update public.eow_calls set status=v_status,ended_at=now()
  where id=p_call_id and (caller_id=auth.uid() or callee_id=auth.uid()) and status in ('ringing','accepted');
end; $$;
create or replace function public.eow_expire_incoming_calls()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.eow_calls set status='missed',ended_at=now()
  where callee_id=auth.uid() and status='ringing' and created_at<now()-interval '45 seconds';
end; $$;
revoke all on function public.eow_start_call(uuid,text) from public;
revoke all on function public.eow_respond_call(uuid,text) from public;
revoke all on function public.eow_end_call(uuid,text) from public;
revoke all on function public.eow_expire_incoming_calls() from public;
grant execute on function public.eow_start_call(uuid,text) to authenticated;
grant execute on function public.eow_respond_call(uuid,text) to authenticated;
grant execute on function public.eow_end_call(uuid,text) to authenticated;
grant execute on function public.eow_expire_incoming_calls() to authenticated;

drop policy if exists "eow_messages_update_read_receipt" on public.messages;
create policy "eow_messages_update_read_receipt" on public.messages for update to authenticated
using (auth.uid()=receiver_id) with check (auth.uid()=receiver_id);
grant update(read_at) on public.messages to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='eow_calls') then
    alter publication supabase_realtime add table public.eow_calls;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='eow_call_signals') then
    alter publication supabase_realtime add table public.eow_call_signals;
  end if;
end $$;
