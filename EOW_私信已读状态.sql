-- EOW 私信已读状态迁移（可选）
-- 执行前先备份。此脚本只增加 read_at 列与收件人可更新已读时间的策略，不删除历史消息。
begin;
alter table public.messages add column if not exists read_at timestamptz;
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;
drop policy if exists eow_messages_mark_read_receiver on public.messages;
create policy eow_messages_mark_read_receiver
on public.messages for update to authenticated
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);
commit;
-- 验证：收件人打开对话后，发件人对应消息的 read_at 应被设置；
-- 发送者不能修改 read_at，用户不能读取其他人的私信。