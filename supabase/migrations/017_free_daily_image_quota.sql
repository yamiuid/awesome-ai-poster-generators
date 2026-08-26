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
  free_image_count integer;
  usage_row public.guest_usage%rowtype;
  utc_today date := (now() at time zone 'UTC')::date;
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

    if usage_row.window_started_at is null
       or (usage_row.window_started_at at time zone 'UTC')::date < utc_today then
      usage_row.generation_count := 0;
      usage_row.window_started_at := now();
    end if;

    if usage_row.generation_count >= 1 then
      return jsonb_build_object('outcome', 'quota_exhausted');
    end if;

    update public.guest_usage
    set generation_count = usage_row.generation_count + 1,
        window_started_at = coalesce(usage_row.window_started_at, now()),
        last_generation_at = now(),
        updated_at = now()
    where guest_key = p_guest_limit_key;
  else
    select coalesce(sum(image_count), 0)::integer into free_image_count
    from public.generations
    where user_id = p_user_id
      and mode = 'free'
      and (created_at at time zone 'UTC')::date = utc_today
      and status in ('submitted', 'processing', 'succeeded', 'partially_succeeded');

    if free_image_count + p_image_count > 4 then
      return jsonb_build_object('outcome', 'quota_exhausted');
    end if;
  end if;

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

revoke execute on function public.create_limited_generation(uuid, text, text, text, text, text, text, text, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.create_limited_generation(uuid, text, text, text, text, text, text, text, text, integer, text, integer) to service_role;
