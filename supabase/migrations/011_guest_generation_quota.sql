alter table public.guest_usage
  add column if not exists generation_count integer not null default 0,
  add column if not exists window_started_at timestamptz;

alter table public.generations
  add column if not exists guest_limit_key text,
  add column if not exists guest_claimed_at timestamptz;

update public.guest_usage
set generation_count = 1,
    window_started_at = last_generation_at
where generation_count = 0
  and last_generation_at is not null
  and last_generation_at > now() - interval '24 hours';

create or replace function public.claim_guest_generation(p_guest_key text)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  used_count integer;
  started_at timestamptz;
begin
  insert into public.guest_usage (
    guest_key,
    last_generation_at,
    generation_count,
    window_started_at
  )
  values (p_guest_key, null, 0, null)
  on conflict (guest_key) do nothing;

  select generation_count, window_started_at
  into used_count, started_at
  from public.guest_usage
  where guest_key = p_guest_key
  for update;

  if started_at is null or started_at <= now() - interval '24 hours' then
    update public.guest_usage
    set generation_count = 1,
        window_started_at = now(),
        last_generation_at = now(),
        updated_at = now()
    where guest_key = p_guest_key;
    return true;
  end if;

  if used_count >= 4 then
    return false;
  end if;

  update public.guest_usage
  set generation_count = used_count + 1,
      last_generation_at = now(),
      updated_at = now()
  where guest_key = p_guest_key;
  return true;
end;
$$;

create or replace function public.release_guest_generation(p_guest_key text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  used_count integer;
begin
  select generation_count
  into used_count
  from public.guest_usage
  where guest_key = p_guest_key
  for update;

  if used_count is null or used_count <= 0 then
    return;
  end if;

  update public.guest_usage
  set generation_count = used_count - 1,
      last_generation_at = case
        when used_count > 1 then last_generation_at
        else null
      end,
      window_started_at = case
        when used_count > 1 then window_started_at
        else null
      end,
      updated_at = now()
  where guest_key = p_guest_key
    and window_started_at > now() - interval '24 hours';
end;
$$;

revoke execute on function public.claim_guest_generation(text) from public, anon, authenticated;
grant execute on function public.claim_guest_generation(text) to service_role;
revoke execute on function public.release_guest_generation(text) from public, anon, authenticated;
grant execute on function public.release_guest_generation(text) to service_role;
