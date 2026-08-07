-- 积分交易按用户 + 时间倒序的查询索引（/account Credits Tab 与余额计算）
create index if not exists credit_transactions_user_created_idx
  on public.credit_transactions (user_id, created_at desc);
