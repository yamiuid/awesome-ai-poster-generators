-- 商业模式切换：注册用户每天免费 4 张 → 新用户一次性赠送积分 + 积分包购买。
--
-- 设计：双桶余额模型。
--   1. 订阅桶：沿用现有 entitlement_periods 月度窗口行，存量 Pro 用户的
--      reserve/settle 链路保持不变。
--   2. 永久桶：新增一种 entitlement_periods 行（bucket = 'permanent'，
--      period_start = 1970-01-01），承载 welcome / 积分包赠送，余额不过期。
--      credit_reservations / credit_transactions 的 period_id NOT NULL 约束
--      因此无需放宽。
--
-- 配套：credit_grants 记录每次赠送（幂等键唯一），claim_welcome_credits /
-- apply_credit_pack_grant 幂等发放，reserve_credits 支持无订阅用户从永久桶扣减，
-- create_limited_generation 移除 free 每日配额、游客改为终身 2 次。

-- ---------------------------------------------------------------------------
-- 1. entitlement_periods：加 bucket 列，放宽 credits_granted 允许 0
--    （永久桶先建 0 余额行，再由赠送累加）
-- ---------------------------------------------------------------------------

alter table public.entitlement_periods
  add column if not exists bucket text not null default 'subscription';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'entitlement_periods_bucket_check'
      and conrelid = 'public.entitlement_periods'::regclass
  ) then
    alter table public.entitlement_periods
      add constraint entitlement_periods_bucket_check
      check (bucket in ('subscription', 'permanent'));
  end if;
end;
$$;

alter table public.entitlement_periods
  drop constraint if exists entitlement_periods_credits_granted_check;

alter table public.entitlement_periods
  add constraint entitlement_periods_credits_granted_check check (credits_granted >= 0);

create index if not exists entitlement_periods_bucket_idx
  on public.entitlement_periods (user_id, bucket);

-- ---------------------------------------------------------------------------
-- 2. credit_grants：赠送审计 + 幂等
-- ---------------------------------------------------------------------------

create table if not exists public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('welcome', 'credit_pack')),
  amount integer not null check (amount > 0),
  idempotency_key text not null unique,
  waffo_order_id text,
  created_at timestamptz not null default now()
);

alter table public.credit_grants enable row level security;

-- 故意不建 RLS policy：该表只允许 service_role 经 security definer 函数写入，
-- 用户不可直读（余额读 entitlement_periods 即可）。

create index if not exists credit_grants_user_idx
  on public.credit_grants (user_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. 永久桶与幂等发放 RPC（均只授予 service_role）
-- ---------------------------------------------------------------------------

create or replace function public.ensure_permanent_bucket(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.entitlement_periods
    (user_id, period_start, period_end, credits_granted, bucket)
  values
    (p_user_id, date '1970-01-01', date '9999-12-31', 0, 'permanent')
  on conflict (user_id, period_start) do update
    set bucket = 'permanent';
end;
$$;

-- 新用户一次性赠送 30 积分。幂等：同一 user_id 无论调用多少次只发放一次。
create or replace function public.claim_welcome_credits(p_user_id uuid)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  inserted_id uuid;
  granted integer := 30;
begin
  if p_user_id is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('welcome:' || p_user_id::text, 0)
  );

  insert into public.credit_grants (user_id, source, amount, idempotency_key)
  values (p_user_id, 'welcome', granted, 'welcome:' || p_user_id::text)
  on conflict (idempotency_key) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return 0;
  end if;

  perform public.ensure_permanent_bucket(p_user_id);

  update public.entitlement_periods
  set credits_granted = credits_granted + granted
  where user_id = p_user_id
    and bucket = 'permanent';

  return granted;
end;
$$;

-- 积分包到账。幂等键绑定 Waffo 订单号：同一订单重复投递只入账一次。
create or replace function public.apply_credit_pack_grant(
  p_user_id uuid,
  p_order_id text,
  p_amount integer
)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  inserted_id uuid;
begin
  if p_user_id is null or p_order_id is null or p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pack:' || p_order_id, 0));

  insert into public.credit_grants (user_id, source, amount, idempotency_key, waffo_order_id)
  values (p_user_id, 'credit_pack', p_amount, 'pack:' || p_order_id, p_order_id)
  on conflict (idempotency_key) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return 0;
  end if;

  perform public.ensure_permanent_bucket(p_user_id);

  update public.entitlement_periods
  set credits_granted = credits_granted + p_amount
  where user_id = p_user_id
    and bucket = 'permanent';

  return p_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. reserve_credits：双桶。订阅用户沿用月度窗口（与 20260911090000 版逻辑
--    一致），无订阅用户从永久桶扣减。
-- ---------------------------------------------------------------------------

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
  'Reserve generation credits. Users with an active subscription draw from their monthly entitlement window (creator=500 / studio=1000 per month, anchored to period_start, never rolls over). Users without a subscription draw from the permanent bucket funded by welcome credits and credit packs.';

-- ---------------------------------------------------------------------------
-- 5. create_limited_generation：free 模式移除每日配额（改由 reserve_credits
--    扣积分），guest 模式从"每天 1 次"改为"终身 2 次"。
-- ---------------------------------------------------------------------------

create or replace function public.create_limited_generation(
  p_user_id uuid,
  p_guest_key text,
  p_legacy_guest_key text,
  p_guest_limit_key text,
  p_prompt text,
  p_style text,
  p_aspect_ratio text,
  p_resolution text,
  p_quality text,
  p_image_count integer,
  p_mode text,
  p_reserved_credits integer
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  existing_id uuid;
  generation_id uuid;
  usage_row public.guest_usage%rowtype;
begin
  if p_mode not in ('guest', 'free') then
    raise exception 'unsupported limited generation mode';
  end if;

  if p_mode = 'free' and p_user_id is null then
    raise exception 'free generation requires a user';
  end if;

  if p_mode = 'guest' and (p_user_id is not null or p_guest_key is null or p_guest_limit_key is null) then
    raise exception 'guest generation requires guest identity';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(p_user_id::text, p_guest_limit_key, p_guest_key), 0)
  );

  if p_mode = 'guest' then
    select id into existing_id
    from public.generations
    where user_id is null
      and guest_key in (p_guest_key, p_legacy_guest_key)
      and status in ('submitted', 'processing')
    limit 1;
  else
    select id into existing_id
    from public.generations
    where user_id = p_user_id
      and mode = 'free'
      and status in ('submitted', 'processing')
    limit 1;
  end if;

  if existing_id is not null then
    return jsonb_build_object('outcome', 'busy');
  end if;

  if p_mode = 'guest' then
    insert into public.guest_usage (guest_key, generation_count, window_started_at)
    values (p_guest_limit_key, 0, null)
    on conflict (guest_key) do nothing;

    select * into usage_row
    from public.guest_usage
    where guest_key = p_guest_limit_key
    for update;

    -- 终身 2 次：不再按 UTC 日清零。旧数据在按日清零体系下计数最多为 1，
    -- 存量游客按已用次数顺延补足到 2 次。
    if usage_row.generation_count >= 2 then
      return jsonb_build_object('outcome', 'quota_exhausted');
    end if;

    update public.guest_usage
    set generation_count = usage_row.generation_count + 1,
        window_started_at = coalesce(usage_row.window_started_at, now()),
        last_generation_at = now(),
        updated_at = now()
    where guest_key = p_guest_limit_key;
  end if;
  -- free 模式不再做每日配额判断：余额由应用层 reserve_credits 预扣。

  insert into public.generations (
    user_id,
    guest_key,
    guest_limit_key,
    guest_claimed_at,
    prompt,
    style,
    aspect_ratio,
    resolution,
    quality,
    image_count,
    mode,
    status,
    progress,
    reserved_credits,
    next_poll_at
  )
  values (
    p_user_id,
    p_guest_key,
    p_guest_limit_key,
    case when p_mode = 'guest' then now() else null end,
    p_prompt,
    p_style,
    p_aspect_ratio,
    p_resolution,
    p_quality,
    p_image_count,
    p_mode,
    'submitted',
    0,
    p_reserved_credits,
    now()
  )
  returning id into generation_id;

  return jsonb_build_object('outcome', 'created', 'generationId', generation_id);
exception
  when unique_violation then
    return jsonb_build_object('outcome', 'busy');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 权限收口
-- ---------------------------------------------------------------------------

revoke execute on function public.ensure_permanent_bucket(uuid) from public, anon, authenticated;
revoke execute on function public.claim_welcome_credits(uuid) from public, anon, authenticated;
revoke execute on function public.apply_credit_pack_grant(uuid, text, integer) from public, anon, authenticated;

grant execute on function public.ensure_permanent_bucket(uuid) to service_role;
grant execute on function public.claim_welcome_credits(uuid) to service_role;
grant execute on function public.apply_credit_pack_grant(uuid, text, integer) to service_role;

revoke execute on function public.create_limited_generation(uuid, text, text, text, text, text, text, text, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.create_limited_generation(uuid, text, text, text, text, text, text, text, text, integer, text, integer) to service_role;
