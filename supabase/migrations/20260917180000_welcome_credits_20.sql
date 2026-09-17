-- 免费账号的注册赠送从 30 点降到 20 点。
--
-- 背景：今天两批批量注册都在几十分钟内把每个账号的 30 点刚好跑完
-- （wave1 114 点、wave2 150 点），验证码和域名黑名单是在提高成本，
-- 每次得手的上限也该一起降下来。
--
-- 只改赠送额度，逻辑不动：仍然一次性、按 user_id 幂等、写 permanent 桶。
-- 已经领过的账号不受影响（credit_grants 的幂等键已经占位，不会再补发，
-- 也不会回收——历史余额按领取时的规则处理）。
--
-- 站点文案（5 种语言、价格页「约 10 张 1K 海报」、客人额度用尽的提示语）
-- 已在同一批改动里对齐。
create or replace function public.claim_welcome_credits(p_user_id uuid)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  inserted_id uuid;
  granted integer := 20;
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

comment on function public.claim_welcome_credits(uuid) is
  '新用户一次性赠送 20 积分。幂等：同一 user_id 无论调用多少次只发放一次。';

revoke execute on function public.claim_welcome_credits(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_welcome_credits(uuid) to service_role;
