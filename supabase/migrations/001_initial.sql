create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  waffo_order_id text unique,
  waffo_subscription_id text unique,
  plan text not null check (plan in ('monthly', 'yearly')),
  status text not null check (status in ('active', 'canceling', 'canceled', 'past_due', 'refunded')),
  activated_at timestamptz not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entitlement_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  credits_granted integer not null default 100 check (credits_granted > 0),
  created_at timestamptz not null default now(),
  unique (user_id, period_start)
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  guest_key text,
  provider_task_id text unique,
  prompt text not null,
  style text not null check (style in ('movie', 'minimal', 'anime', 'business', 'vintage', 'neon')),
  aspect_ratio text not null check (aspect_ratio in ('1:1', '4:5', '2:3', '16:9')),
  resolution text not null check (resolution in ('1k', '2k', '4k')),
  quality text not null check (quality in ('low', 'medium', 'high')),
  mode text not null check (mode in ('guest', 'free', 'pro')),
  status text not null check (status in ('submitted', 'processing', 'succeeded', 'partially_succeeded', 'failed', 'timed_out')) default 'submitted',
  progress integer not null default 0 check (progress between 0 and 100),
  reserved_credits integer not null default 0 check (reserved_credits >= 0),
  error_code text,
  error_message text,
  next_poll_at timestamptz,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists generations_user_created_idx on public.generations (user_id, created_at desc);
create index if not exists generations_guest_key_idx on public.generations (guest_key, created_at desc);
create index if not exists generations_poll_idx on public.generations (status, next_poll_at);

create table if not exists public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  guest_key text,
  storage_path text not null unique,
  alt_text text not null,
  watermarked boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null unique references public.generations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid not null references public.entitlement_periods(id) on delete restrict,
  amount integer not null check (amount > 0),
  status text not null check (status in ('reserved', 'settled', 'released')) default 'reserved',
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid not null references public.entitlement_periods(id) on delete restrict,
  generation_id uuid references public.generations(id) on delete set null,
  kind text not null check (kind in ('consume', 'refund', 'adjustment')),
  amount integer not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  waffo_event_id text not null unique,
  event_type text not null,
  event_mode text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.guest_usage (
  guest_key text primary key,
  last_generation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

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
  period_step interval;
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

  period_step := case when active_subscription.plan = 'yearly' then interval '12 months' else interval '1 month' end;
  period_start_ts := active_subscription.activated_at;
  period_end_ts := period_start_ts + period_step;
  while period_end_ts <= now() loop
    period_start_ts := period_end_ts;
    period_end_ts := period_start_ts + period_step;
  end loop;

  insert into public.entitlement_periods (user_id, period_start, period_end)
  values (p_user_id, period_start_ts::date, period_end_ts::date)
  on conflict (user_id, period_start) do nothing;

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

create or replace function public.settle_credits(p_generation_id uuid, p_successful_images integer, p_cost_per_image integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  reservation public.credit_reservations%rowtype;
  consume_amount integer;
begin
  select * into reservation from public.credit_reservations where generation_id = p_generation_id for update;
  if not found or reservation.status <> 'reserved' then
    return false;
  end if;

  consume_amount := greatest(0, least(p_successful_images, 4)) * greatest(0, p_cost_per_image);
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

create or replace function public.claim_guest_generation(p_guest_key text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  previous timestamptz;
begin
  insert into public.guest_usage (guest_key, last_generation_at)
  values (p_guest_key, null)
  on conflict (guest_key) do nothing;

  select last_generation_at into previous
  from public.guest_usage
  where guest_key = p_guest_key
  for update;

  if previous is not null and previous > now() - interval '24 hours' then
    return false;
  end if;

  update public.guest_usage set last_generation_at = now(), updated_at = now()
  where guest_key = p_guest_key;
  return true;
end;
$$;

create or replace function public.release_guest_generation(p_guest_key text)
returns void
language sql
security definer set search_path = public
as $$
  update public.guest_usage set last_generation_at = null, updated_at = now()
  where guest_key = p_guest_key;
$$;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlement_periods enable row level security;
alter table public.generations enable row level security;
alter table public.generated_assets enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.payment_events enable row level security;
alter table public.guest_usage enable row level security;

create policy "profiles own row" on public.profiles for select using (auth.uid() = id);
create policy "subscriptions own row" on public.subscriptions for select using (auth.uid() = user_id);
create policy "periods own rows" on public.entitlement_periods for select using (auth.uid() = user_id);
create policy "generations own rows" on public.generations for select using (auth.uid() = user_id);
create policy "assets own rows" on public.generated_assets for select using (auth.uid() = user_id);
create policy "reservations own rows" on public.credit_reservations for select using (auth.uid() = user_id);
create policy "transactions own rows" on public.credit_transactions for select using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('posters', 'posters', false)
on conflict (id) do nothing;

create policy "users read poster assets" on storage.objects for select
  using (bucket_id = 'posters' and auth.uid()::text = (storage.foldername(name))[1]);
