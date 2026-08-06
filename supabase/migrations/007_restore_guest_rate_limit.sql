-- 上线前恢复免费用户 24h 每日生成限制（撤销 006 的测试期临时取消）
-- 逻辑与 001 原始版本一致，但保留 006 的 search_path = '' 安全配置
create or replace function public.claim_guest_generation(p_guest_key text)
returns boolean
language plpgsql
security definer set search_path = ''
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

revoke execute on function public.claim_guest_generation(text) from public, anon, authenticated;
grant execute on function public.claim_guest_generation(text) to service_role;
