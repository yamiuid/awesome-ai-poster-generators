-- Durable trial queue; existing balances and grants are preserved.
alter table public.generations add column queued_request jsonb;

-- New accounts must originate from Google OAuth. Existing email accounts can still sign in.
create table public.google_signup_eligibility (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.google_signup_eligibility enable row level security;
revoke all on table public.google_signup_eligibility from public, anon, authenticated;

create or replace function public.require_google_signup()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
    raise exception 'GOOGLE_SIGNUP_REQUIRED: Create your account with Google.';
  end if;
  insert into public.google_signup_eligibility (user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.require_google_signup() from public, anon, authenticated;
create trigger require_google_signup before insert on auth.users
for each row execute function public.require_google_signup();

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

  if p_image_count <> 1 then
    raise exception 'free generations require one image';
  end if;
  if (p_mode = 'guest' and (p_resolution <> '1k' or p_quality <> 'low'))
    or (p_mode = 'free' and (p_resolution <> '1k' or p_quality <> 'low')) then
    raise exception 'invalid free output tier';
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

    -- One lifetime guest preview; failed claims are released by fail_limited_generation.
    if usage_row.generation_count >= 1 then
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

create or replace function public.claim_welcome_credits(p_user_id uuid)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  inserted_id uuid;
  granted integer := 20;
  user_email text;
  candidate text;
begin
  if p_user_id is null then
    return 0;
  end if;

  if not exists (select 1 from public.google_signup_eligibility where user_id = p_user_id) then
    return 0;
  end if;

  if not exists (
    select 1
    from auth.users u
    join auth.identities i on i.user_id = u.id
    where u.id = p_user_id
      and u.raw_app_meta_data ->> 'provider' = 'google'
      and i.provider = 'google'
      and i.created_at <= u.created_at + interval '5 minutes'
      and not exists (
        select 1 from auth.identities earlier
        where earlier.user_id = u.id and earlier.provider <> 'google'
          and earlier.created_at <= i.created_at
      )
  ) then
    return 0;
  end if;

  -- 第二道闸门：黑名单命中就不发。必须在写 credit_grants 之前返回。
  select lower(btrim(u.email)) into user_email
  from auth.users u
  where u.id = p_user_id;

  if user_email is not null and position('@' in user_email) > 0 then
    candidate := split_part(user_email, '@', 2);

    while position('.' in candidate) > 0 loop
      if exists (
        select 1
        from public.blocked_email_domains b
        where b.domain = candidate
          and b.active
      ) then
        return 0;
      end if;

      candidate := substring(candidate from position('.' in candidate) + 1);
    end loop;
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


revoke execute on function public.claim_welcome_credits(uuid) from public, anon, authenticated;
grant execute on function public.claim_welcome_credits(uuid) to service_role;
comment on function public.claim_welcome_credits(uuid) is 'Google identity only, one-time 20 credits: about ten watermarked 1K Low posters without references. Existing grants are unchanged.';

-- Failure and reservation release must commit together.
create or replace function public.fail_limited_generation(
  p_generation_id uuid,
  p_status text,
  p_message text
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  generation_row public.generations%rowtype;
  usage_row public.guest_usage%rowtype;
begin
  if p_status not in ('failed', 'timed_out') then
    raise exception 'invalid terminal generation status';
  end if;

  select * into generation_row
  from public.generations
  where id = p_generation_id
  for update;

  if not found or generation_row.status in ('succeeded', 'partially_succeeded', 'failed', 'timed_out') then
    return jsonb_build_object('updated', false);
  end if;

  if generation_row.guest_claimed_at is not null and generation_row.guest_limit_key is not null then
    select * into usage_row
    from public.guest_usage
    where guest_key = generation_row.guest_limit_key
    for update;

    if found then
      update public.guest_usage
      set generation_count = greatest(0, usage_row.generation_count - 1),
          last_generation_at = case
            when usage_row.generation_count > 1 then usage_row.last_generation_at
            else null
          end,
          window_started_at = case
            when usage_row.generation_count > 1 then usage_row.window_started_at
            else null
          end,
          updated_at = now()
      where guest_key = generation_row.guest_limit_key;
    end if;
  end if;

  update public.generations
  set status = p_status,
      error_message = p_message,
      progress = 100,
      completed_at = now(),
      reserved_credits = 0,
      guest_claimed_at = null
  where id = p_generation_id;

  -- Release the reservation in the same transaction as the terminal state.
  perform public.settle_credits(p_generation_id, 0, 0, 0);

  return jsonb_build_object('updated', true);
end;
$$;

revoke execute on function public.fail_limited_generation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fail_limited_generation(uuid, text, text) to service_role;

-- Recover reservations left behind by interrupted failures.
update public.credit_reservations r
set status = 'released', settled_at = now()
from public.generations g
where g.id = r.generation_id and g.status in ('failed', 'timed_out')
  and r.status = 'reserved';

-- Cap repeated cookie resets while allowing multiple people behind one network.
create or replace function public.consume_guest_ip_rate_limit(
  p_ip_hash text,
  p_action text
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  now_at timestamptz := now();
  max_count integer;
  current_count integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid guest IP hash';
  end if;

  if p_action = 'generation' then
    max_count := 5;
  elsif p_action = 'upload' then
    max_count := 60;
  else
    raise exception 'invalid guest rate limit action';
  end if;

  insert into public.guest_ip_rate_limits (
    ip_hash,
    action,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_ip_hash, p_action, now_at, 1, now_at)
  on conflict (ip_hash, action) do update
  set window_started_at = case
        when public.guest_ip_rate_limits.window_started_at <= now_at - interval '1 hour'
          then now_at
        else public.guest_ip_rate_limits.window_started_at
      end,
      request_count = case
        when public.guest_ip_rate_limits.window_started_at <= now_at - interval '1 hour'
          then 1
        else least(public.guest_ip_rate_limits.request_count + 1, max_count + 1)
      end,
      updated_at = now_at
  returning request_count into current_count;

  return current_count <= max_count;
end;
$$;

revoke execute on function public.consume_guest_ip_rate_limit(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_guest_ip_rate_limit(text, text)
  to service_role;
