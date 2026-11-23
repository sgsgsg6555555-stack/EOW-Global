-- EOW 扩展升级：后台、蓝V、钱包账本、礼物、充值订单、举报与主页背景
-- 执行前请备份数据库。此脚本只新增结构/策略，不删除现有用户数据。
begin;

grant usage on schema public to authenticated;

alter table public.profiles add column if not exists cover_url text;

create table if not exists public.eow_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('super_admin','admin','moderator','finance','community')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.eow_is_admin()
returns boolean language sql stable security definer
set search_path=public
as $$
  select exists(select 1 from public.eow_admins a where a.user_id=auth.uid() and a.active=true);
$$;

create table if not exists public.eow_verification_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  proof_url text,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.eow_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check(target_type in ('user','post','comment','community','message')),
  target_id text not null,
  reason text not null,
  details text,
  status text not null default 'pending' check(status in ('pending','resolved','dismissed')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.eow_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_coins bigint not null default 0 check(balance_coins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.eow_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta_coins bigint not null,
  balance_after bigint not null,
  entry_type text not null,
  reference_id text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.eow_gifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_coins bigint not null check(price_coins > 0),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.eow_gift_transactions (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id),
  receiver_id uuid not null references auth.users(id),
  gift_id uuid not null references public.eow_gifts(id),
  quantity integer not null default 1 check(quantity between 1 and 100),
  total_coins bigint not null,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.eow_topup_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cny numeric(12,2) not null check(amount_cny > 0),
  coins bigint not null check(coins > 0),
  provider text not null check(provider in ('wechat','alipay','manual')),
  status text not null default 'pending' check(status in ('pending','paid','failed','refunded','cancelled')),
  provider_trade_no text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.eow_site_settings (
  key text primary key,
  value text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.eow_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 自动为新用户初始化钱包
create or replace function public.eow_create_wallet_for_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.eow_wallets(user_id,balance_coins) values(new.id,0) on conflict(user_id) do nothing;
 return new;
end $$;
drop trigger if exists eow_wallet_on_signup on auth.users;
create trigger eow_wallet_on_signup after insert on auth.users
for each row execute procedure public.eow_create_wallet_for_user();

-- 为历史用户补建空钱包
insert into public.eow_wallets(user_id,balance_coins)
select id,0 from auth.users on conflict(user_id) do nothing;

-- 原项目曾出现 permission denied：显式补齐 authenticated 的表权限。
grant select,insert,update,delete on public.friendships,public.messages,public.notifications,
 public.profiles,public.posts,public.comments,public.likes,public.follows,
 public.communities,public.community_members to authenticated;
grant select,insert,update,delete on public.eow_verification_applications,
 public.eow_reports,public.eow_wallets,public.eow_wallet_ledger,
 public.eow_gifts,public.eow_gift_transactions,public.eow_topup_orders,
 public.eow_site_settings,public.eow_admin_audit_logs,public.eow_admins to authenticated;

-- Admin table: only active admins can see admin roster; no client insert policy.
alter table public.eow_admins enable row level security;
drop policy if exists eow_admins_read_self_or_admin on public.eow_admins;
create policy eow_admins_read_self_or_admin on public.eow_admins for select to authenticated
using(user_id=auth.uid() or public.eow_is_admin());

-- Admin access policies for platform management.
do $$
declare t text;
begin
 foreach t in array array['profiles','posts','eow_verification_applications','eow_reports','eow_gifts','eow_topup_orders','eow_site_settings','eow_admin_audit_logs','eow_wallets','eow_wallet_ledger','eow_gift_transactions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists eow_admin_all on public.%I',t);
  execute format('create policy eow_admin_all on public.%I for all to authenticated using (public.eow_is_admin()) with check (public.eow_is_admin())',t);
 end loop;
end $$;

-- 用户端：认证申请只能本人提交/查看；审核由管理员策略负责。
drop policy if exists eow_verification_insert_own on public.eow_verification_applications;
create policy eow_verification_insert_own on public.eow_verification_applications
for insert to authenticated with check(user_id=auth.uid() and status='pending');
drop policy if exists eow_verification_read_own on public.eow_verification_applications;
create policy eow_verification_read_own on public.eow_verification_applications
for select to authenticated using(user_id=auth.uid());

-- 举报人可以提交和查看自己的举报。
drop policy if exists eow_reports_insert_own on public.eow_reports;
create policy eow_reports_insert_own on public.eow_reports
for insert to authenticated with check(reporter_id=auth.uid());
drop policy if exists eow_reports_read_own on public.eow_reports;
create policy eow_reports_read_own on public.eow_reports
for select to authenticated using(reporter_id=auth.uid());

-- 礼物目录可供登录用户读取，修改仅管理员。
drop policy if exists eow_gifts_read_active on public.eow_gifts;
create policy eow_gifts_read_active on public.eow_gifts for select to authenticated
using(active=true or public.eow_is_admin());

-- 钱包和流水仅本人读取，管理员可通过 eow_admin_all 查看。
drop policy if exists eow_wallet_read_own on public.eow_wallets;
create policy eow_wallet_read_own on public.eow_wallets for select to authenticated using(user_id=auth.uid());
drop policy if exists eow_ledger_read_own on public.eow_wallet_ledger;
create policy eow_ledger_read_own on public.eow_wallet_ledger for select to authenticated using(user_id=auth.uid());

-- 充值订单由服务端支付回调写入/更新；用户只能查看自己的订单。
drop policy if exists eow_topup_read_own on public.eow_topup_orders;
create policy eow_topup_read_own on public.eow_topup_orders for select to authenticated using(user_id=auth.uid());

-- 礼物赠送由原子 RPC 完成，前端不能直接改余额或流水。
drop policy if exists eow_gift_tx_read_participant on public.eow_gift_transactions;
create policy eow_gift_tx_read_participant on public.eow_gift_transactions for select to authenticated
using(sender_id=auth.uid() or receiver_id=auth.uid());

create or replace function public.eow_send_gift(p_receiver uuid,p_gift uuid,p_quantity integer default 1,p_message text default null)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_sender uuid:=auth.uid(); v_price bigint; v_total bigint; v_balance bigint; v_tx uuid;
begin
 if v_sender is null then raise exception '需要登录'; end if;
 if p_receiver is null or p_receiver=v_sender then raise exception '收礼人无效'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>100 then raise exception '礼物数量无效'; end if;
 select price_coins into v_price from public.eow_gifts where id=p_gift and active=true;
 if v_price is null then raise exception '礼物不存在或已下架'; end if;
 v_total:=v_price*p_quantity;
 insert into public.eow_wallets(user_id,balance_coins) values(v_sender,0) on conflict(user_id) do nothing;
 select balance_coins into v_balance from public.eow_wallets where user_id=v_sender for update;
 if v_balance<v_total then raise exception '金币余额不足'; end if;
 update public.eow_wallets set balance_coins=balance_coins-v_total,updated_at=now() where user_id=v_sender returning balance_coins into v_balance;
 insert into public.eow_wallet_ledger(user_id,delta_coins,balance_after,entry_type,note,created_by)
 values(v_sender,-v_total,v_balance,'gift_sent','赠送礼物',v_sender);
 insert into public.eow_gift_transactions(sender_id,receiver_id,gift_id,quantity,total_coins,message)
 values(v_sender,p_receiver,p_gift,p_quantity,v_total,left(coalesce(p_message,''),300)) returning id into v_tx;
 return v_tx;
end $$;
revoke all on function public.eow_send_gift(uuid,uuid,integer,text) from public;
grant execute on function public.eow_send_gift(uuid,uuid,integer,text) to authenticated;


-- 明确修复原站报出的 friendships/messages/notifications permission denied。
alter table public.friendships enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
drop policy if exists eow_friendships_read_participant_v2 on public.friendships;
create policy eow_friendships_read_participant_v2 on public.friendships for select to authenticated
using(auth.uid()=requester_id or auth.uid()=addressee_id);
drop policy if exists eow_friendships_insert_requester_v2 on public.friendships;
create policy eow_friendships_insert_requester_v2 on public.friendships for insert to authenticated
with check(auth.uid()=requester_id and requester_id<>addressee_id);
drop policy if exists eow_friendships_update_addressee_v2 on public.friendships;
create policy eow_friendships_update_addressee_v2 on public.friendships for update to authenticated
using(auth.uid()=addressee_id) with check(auth.uid()=addressee_id);
drop policy if exists eow_friendships_delete_participant_v2 on public.friendships;
create policy eow_friendships_delete_participant_v2 on public.friendships for delete to authenticated
using(auth.uid()=requester_id or auth.uid()=addressee_id);

drop policy if exists eow_messages_read_participant_v2 on public.messages;
create policy eow_messages_read_participant_v2 on public.messages for select to authenticated
using(auth.uid()=sender_id or auth.uid()=receiver_id);
drop policy if exists eow_messages_insert_sender_v2 on public.messages;
create policy eow_messages_insert_sender_v2 on public.messages for insert to authenticated
with check(auth.uid()=sender_id and sender_id<>receiver_id);

drop policy if exists eow_notifications_read_recipient_v2 on public.notifications;
create policy eow_notifications_read_recipient_v2 on public.notifications for select to authenticated
using(auth.uid()=recipient_id);
drop policy if exists eow_notifications_update_recipient_v2 on public.notifications;
create policy eow_notifications_update_recipient_v2 on public.notifications for update to authenticated
using(auth.uid()=recipient_id) with check(auth.uid()=recipient_id);
drop policy if exists eow_notifications_insert_actor_v2 on public.notifications;
create policy eow_notifications_insert_actor_v2 on public.notifications for insert to authenticated
with check(auth.uid()=actor_id);



-- 管理员调整金币：必须有管理员身份，且记录审计流水。
create or replace function public.eow_admin_adjust_coins(p_user uuid,p_delta bigint,p_note text)
returns bigint language plpgsql security definer set search_path=public
as $$
declare v_balance bigint;
begin
 if not public.eow_is_admin() then raise exception '无管理员权限'; end if;
 if p_delta=0 or abs(p_delta)>100000000 then raise exception '调整数量无效'; end if;
 insert into public.eow_wallets(user_id,balance_coins) values(p_user,0) on conflict(user_id) do nothing;
 select balance_coins into v_balance from public.eow_wallets where user_id=p_user for update;
 if v_balance+p_delta<0 then raise exception '调整后余额不能为负数'; end if;
 update public.eow_wallets set balance_coins=balance_coins+p_delta,updated_at=now() where user_id=p_user returning balance_coins into v_balance;
 insert into public.eow_wallet_ledger(user_id,delta_coins,balance_after,entry_type,note,created_by)
 values(p_user,p_delta,v_balance,'admin_adjustment',left(coalesce(p_note,''),300),auth.uid());
 insert into public.eow_admin_audit_logs(admin_id,action,target_type,target_id,details)
 values(auth.uid(),'adjust_coins','user',p_user::text,jsonb_build_object('delta',p_delta,'note',p_note));
 return v_balance;
end $$;
revoke all on function public.eow_admin_adjust_coins(uuid,bigint,text) from public;
grant execute on function public.eow_admin_adjust_coins(uuid,bigint,text) to authenticated;

revoke update on public.profiles from authenticated;
grant update (username,display_name,avatar_url,bio,cover_url) on public.profiles to authenticated;
grant select,insert on public.profiles to authenticated;

commit;

-- 首位管理员需在执行后手动添加，替换为自己的 auth.users.id：
-- insert into public.eow_admins(user_id,role) values ('你的用户UUID','super_admin');
-- 不要给普通用户创建 eow_admins 记录。
-- 微信/支付宝支付回调必须由受信任的服务端 Edge Function 校验签名后更新订单与钱包，
-- 不可从浏览器端直接将 eow_topup_orders.status 改为 paid。


-- 附加修复：礼物收发双方余额与流水一致
-- EOW 礼物赠送账本修复
-- 在 Supabase SQL Editor 中单独执行本文件即可；不会重建表或删除数据。
-- 修复：赠送者扣款、收礼者入账、双方流水、收礼通知在同一事务中完成。

create or replace function public.eow_send_gift(
  p_receiver uuid,
  p_gift uuid,
  p_quantity integer default 1,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_price bigint;
  v_total bigint;
  v_sender_balance bigint;
  v_receiver_balance bigint;
  v_tx uuid;
  v_gift_name text;
begin
  if v_sender is null then
    raise exception '需要登录';
  end if;
  if p_receiver is null or p_receiver = v_sender then
    raise exception '收礼人无效';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception '礼物数量必须为 1 到 100';
  end if;

  select price_coins, name
    into v_price, v_gift_name
  from public.eow_gifts
  where id = p_gift and active = true;

  if v_price is null then
    raise exception '礼物不存在或已下架';
  end if;

  v_total := v_price * p_quantity;

  -- 确保双方钱包存在，并按固定顺序锁定，降低并发死锁风险。
  insert into public.eow_wallets(user_id, balance_coins)
  values (v_sender, 0), (p_receiver, 0)
  on conflict (user_id) do nothing;

  perform user_id
  from public.eow_wallets
  where user_id in (v_sender, p_receiver)
  order by user_id
  for update;

  select balance_coins into v_sender_balance
  from public.eow_wallets
  where user_id = v_sender;

  if v_sender_balance < v_total then
    raise exception '金币余额不足';
  end if;

  update public.eow_wallets
  set balance_coins = balance_coins - v_total, updated_at = now()
  where user_id = v_sender
  returning balance_coins into v_sender_balance;

  update public.eow_wallets
  set balance_coins = balance_coins + v_total, updated_at = now()
  where user_id = p_receiver
  returning balance_coins into v_receiver_balance;

  insert into public.eow_wallet_ledger
    (user_id, delta_coins, balance_after, entry_type, note, created_by)
  values
    (v_sender, -v_total, v_sender_balance, 'gift_sent',
     '赠送礼物：' || v_gift_name || ' × ' || p_quantity, v_sender),
    (p_receiver, v_total, v_receiver_balance, 'gift_received',
     '收到礼物：' || v_gift_name || ' × ' || p_quantity, v_sender);

  insert into public.eow_gift_transactions
    (sender_id, receiver_id, gift_id, quantity, total_coins, message)
  values
    (v_sender, p_receiver, p_gift, p_quantity, v_total,
     left(coalesce(p_message, ''), 300))
  returning id into v_tx;

  insert into public.notifications
    (recipient_id, actor_id, type, content, is_read, created_at)
  values
    (p_receiver, v_sender, 'gift',
     '向你赠送了 ' || v_gift_name || ' × ' || p_quantity,
     false, now());

  return v_tx;
end;
$$;

revoke all on function public.eow_send_gift(uuid, uuid, integer, text) from public;
grant execute on function public.eow_send_gift(uuid, uuid, integer, text) to authenticated;



