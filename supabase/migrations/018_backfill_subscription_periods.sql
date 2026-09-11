-- 回填 2026-09-06 之后因 Waffo webhook 字段迁移而停滞的订阅周期。
--
-- 背景：自 2026-09-06 起 subscription.payment_succeeded 不再携带
-- billingPeriod / currentPeriodStart / currentPeriodEnd / orderStatus。旧代码在续费时
-- 拿不到周期字段，会把 period_start / period_end 回退成库里的旧值，导致已付费订阅在
-- period_end 过后被 lifecycleState 判为 stale、失去 Pro 权限。
--
-- 新周期改由 subscription.renewed 投递（需在商户后台「Webhook 设置」勾选），本迁移
-- 按公告口径回补存量：周期起始日 = 付款日（paymentDate），周期长度 = 商品计费周期；
-- 若历史事件本身带 currentPeriodStart / currentPeriodEnd 则优先采用。
--
-- 仅向前推进 period_start / period_end，不触碰 activated_at —— reserve_credits 是按
-- activated_at 推算 entitlement 周期的，回填 activated_at 会导致重复发放积分。
with event_periods as (
  select
    s.user_id,
    coalesce(
      nullif(e.payload #>> '{data,currentPeriodStart}', '')::timestamptz,
      nullif(e.payload #>> '{data,paymentDate}', '')::timestamptz
    ) as period_start,
    coalesce(
      nullif(e.payload #>> '{data,currentPeriodEnd}', '')::timestamptz,
      case
        when nullif(e.payload #>> '{data,paymentDate}', '') is not null then
          nullif(e.payload #>> '{data,paymentDate}', '')::timestamptz
            + case
                when s.plan = 'yearly' then interval '12 months'
                else interval '1 month'
              end
      end
    ) as period_end
  from public.subscriptions s
  join public.payment_events e
    on e.payload #>> '{data,orderId}' = s.waffo_order_id
  where s.status in ('active', 'canceling')
    and e.event_type in (
      'subscription.activated',
      'subscription.renewed',
      'subscription.recovered',
      'subscription.payment_succeeded'
    )
),
latest_period as (
  select distinct on (user_id) user_id, period_start, period_end
  from event_periods
  where period_end is not null
  order by user_id, period_end desc
)
update public.subscriptions s
set period_start = l.period_start,
    period_end = l.period_end,
    updated_at = now()
from latest_period l
where s.user_id = l.user_id
  and l.period_start is not null
  and l.period_end > s.period_end;
