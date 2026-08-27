update public.entitlement_periods as period
set credits_granted = case when subscription.tier = 'studio' then 1_000 else 500 end
from public.subscriptions as subscription
where period.user_id = subscription.user_id
  and subscription.status in ('active', 'canceling')
  and period.period_start <= current_date
  and period.period_end > current_date;

create or replace function public.reserve_credits(p_user_id uuid, p_generation_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer set search_path = public
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

  period_start_ts := active_subscription.activated_at;
  period_end_ts := period_start_ts + interval '1 month';
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
    - coalesce((select sum(amount) from public.credit_transactions where period_id = current_period.id), 0)
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
  'Reserve generation credits. Monthly and yearly plans both refresh every month, with creator=500 and studio=1000 credits per window. Credits reset monthly and never roll over.';
