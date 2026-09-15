-- 图生图参考图：
-- 1) generations 记录参考图张数，结算时随 consume 一并收取（每张 1 积分）
-- 2) settle_credits 增加 p_surcharge（默认 0，旧调用兼容）：有成功图片时加收
-- 3) create_limited_generation 透传 p_reference_count

alter table public.generations
  add column if not exists reference_count integer not null default 0;

create or replace function public.settle_credits(
  p_generation_id uuid,
  p_successful_images integer,
  p_cost_per_image integer,
  p_surcharge integer default 0
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  reservation public.credit_reservations%rowtype;
  consume_amount integer;
  surcharge_amount integer;
begin
  select * into reservation from public.credit_reservations where generation_id = p_generation_id for update;
  if not found or reservation.status <> 'reserved' then
    return false;
  end if;

  -- 参考图加价只在有成功图片时收取（全失败则随预扣释放返还）
  surcharge_amount := 0;
  if greatest(0, least(coalesce(p_successful_images, 0), 4)) > 0 and coalesce(p_surcharge, 0) > 0 then
    surcharge_amount := least(p_surcharge, 5);
  end if;

  consume_amount :=
    greatest(0, least(coalesce(p_successful_images, 0), 4)) * greatest(0, coalesce(p_cost_per_image, 0))
    + surcharge_amount;
  if consume_amount > 0 then
    insert into public.credit_transactions (user_id, period_id, generation_id, kind, amount, idempotency_key)
    values (reservation.user_id, reservation.period_id, p_generation_id, 'consume', consume_amount, p_generation_id::text || ':consume')
    on conflict (idempotency_key) do nothing;
  end if;

  update public.credit_reservations
  set status = case when consume_amount > 0 then 'settled' else 'released' end, settled_at = now()
  where id = reservation.id;
  return true;
end;
$$;

revoke execute on function public.settle_credits(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.settle_credits(uuid, integer, integer, integer) to service_role;

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
  p_reserved_credits integer,
  p_reference_count integer default 0
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
    reference_count,
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
    greatest(0, least(coalesce(p_reference_count, 0), 5)),
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

revoke execute on function public.create_limited_generation(uuid, text, text, text, text, text, text, text, text, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.create_limited_generation(uuid, text, text, text, text, text, text, text, text, integer, text, integer, integer) to service_role;
-- 旧 12 参签名调用兼容（默认 p_reference_count = 0）
grant execute on function public.create_limited_generation(uuid, text, text, text, text, text, text, text, text, integer, text, integer) to service_role;
