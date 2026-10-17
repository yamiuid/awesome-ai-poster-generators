create table public.guest_ip_rate_limits (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (action in ('generation', 'upload')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null,
  primary key (ip_hash, action)
);

create index guest_ip_rate_limits_updated_at_idx
  on public.guest_ip_rate_limits (updated_at);

alter table public.guest_ip_rate_limits enable row level security;
revoke all on table public.guest_ip_rate_limits from public, anon, authenticated;
grant all on table public.guest_ip_rate_limits to service_role;

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
    max_count := 30;
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
