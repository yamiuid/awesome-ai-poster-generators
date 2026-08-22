with valid_guest_usage as (
  select
    guest_key,
    count(*)::integer as generation_count,
    min(created_at) as window_started_at,
    max(created_at) as last_generation_at
  from public.generations
  where user_id is null
    and guest_key is not null
    and (created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date
    and status in ('submitted', 'processing', 'succeeded', 'partially_succeeded')
  group by guest_key
)
insert into public.guest_usage (
  guest_key,
  generation_count,
  window_started_at,
  last_generation_at,
  updated_at
)
select
  guest_key,
  generation_count,
  window_started_at,
  last_generation_at,
  now()
from valid_guest_usage
on conflict (guest_key) do update
set generation_count = excluded.generation_count,
    window_started_at = excluded.window_started_at,
    last_generation_at = excluded.last_generation_at,
    updated_at = now();
