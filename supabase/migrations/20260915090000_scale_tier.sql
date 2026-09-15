-- 新增 Scale 订阅档位（3000 积分/月），并把 Studio 年付价格调整为 $149 使折扣随档位递增。
-- 1. subscriptions.tier check 约束加入 'scale'
-- 2. reserve_credits 的周期发放积分表更新：creator=500 / studio=1000 / scale=3000

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_tier_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      drop constraint subscriptions_tier_check;
  end if;
end;
$$;

alter table public.subscriptions
  add constraint subscriptions_tier_check
  check (tier in ('creator', 'studio', 'scale'));

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

  if found then
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
      case active_subscription.tier
        when 'studio' then 1_000
        when 'scale' then 3_000
        else 500
      end
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
  end if;

  -- 无订阅用户：welcome / 积分包积分存放在永久桶。
  perform public.ensure_permanent_bucket(p_user_id);

  select * into current_period
  from public.entitlement_periods
  where user_id = p_user_id
    and bucket = 'permanent'
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
  'Reserve generation credits. Subscribers draw from their monthly entitlement window (creator=500 / studio=1000 / scale=3000 per month, anchored to period_start, never rolls over). Users without a subscription draw from the permanent bucket funded by welcome credits and credit packs.';
