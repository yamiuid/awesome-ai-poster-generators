-- 积分窗口改以「当前计费周期起点」为锚，并与账本口径统一。
--
-- 背景：此前 reserve_credits 用 subscriptions.activated_at 推算积分窗口，而 webhook
-- 每个事件都会覆盖 activated_at（例如续费回执带回 paymentDate 或已结束的周期）。
-- 一旦写入的日期与当前窗口的键不是同一天，就会在同一个自然月里多插一行
-- entitlement_periods，等于白送整月额度（creator 500 / studio 1000）。
--
-- 现在：
--   1. 锚点改为 period_start（webhook 用订阅域事件的权威周期维护它）；
--   2. activated_at 只表示首次激活时间，webhook 不再改写；
--   3. 可用额度只统计 kind = 'consume'，与 credit-ledger.getAccountBalance 一致。
--      （refund / adjustment 目前无人写入；将来若启用，两处必须一起改。）
create or replace function public.reserve_credits(p_user_id uuid, p_generation_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  active_subscription public.subscriptions%rowtype;
  current_period public.entitlement_periods%rowtype;
  available integer;
  period_start_ts timestamptz;
  period_end_ts timestamptz;
begin
  if p_amount <= 0 then
    return false;
  end if;

  select * into active_subscription
  from public.subscriptions
  where user_id = p_user_id
    and status in ('active', 'canceling')
    and period_end > now()
  for update;

  if not found then
    return false;
  end if;

  period_start_ts := active_subscription.period_start;
  period_end_ts := period_start_ts + interval '1 month';
  -- 只向前滚动：即使事件写进来的周期起点偏旧，也会落到覆盖 now() 的那一档。
  while period_end_ts <= now() loop
    period_start_ts := period_end_ts;
    period_end_ts := period_start_ts + interval '1 month';
  end loop;

  insert into public.entitlement_periods (user_id, period_start, period_end, credits_granted)
  values (
    p_user_id,
    period_start_ts::date,
    period_end_ts::date,
    case when active_subscription.tier = 'studio' then 1_000 else 500 end
  )
  on conflict (user_id, period_start) do update
    set period_end = excluded.period_end,
        credits_granted = excluded.credits_granted;

  select * into current_period
  from public.entitlement_periods
  where user_id = p_user_id
    and period_start = period_start_ts::date
  for update;

  select current_period.credits_granted
    - coalesce((select sum(amount) from public.credit_transactions where period_id = current_period.id and kind = 'consume'), 0)
    - coalesce((select sum(amount) from public.credit_reservations where period_id = current_period.id and status = 'reserved'), 0)
  into available;

  if available < p_amount then
    return false;
  end if;

  insert into public.credit_reservations (generation_id, user_id, period_id, amount)
  values (p_generation_id, p_user_id, current_period.id, p_amount)
  on conflict (generation_id) do nothing;
  return true;
end;
$$;

comment on function public.reserve_credits(uuid, uuid, integer) is
  'Reserve generation credits. Monthly and yearly plans both refresh every month, with creator=500 and studio=1000 credits per window. The window is anchored to the current billing period start (subscriptions.period_start), not to the first activation time. Credits reset monthly and never roll over.';

revoke execute on function public.reserve_credits(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, uuid, integer) to service_role;
