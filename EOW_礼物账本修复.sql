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
