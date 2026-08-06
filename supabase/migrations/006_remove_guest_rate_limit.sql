-- 测试阶段临时取消免费用户每日生成限制（上线前需恢复 24h 冷却）
create or replace function public.claim_guest_generation(p_guest_key text)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.guest_usage (guest_key, last_generation_at)
  values (p_guest_key, null)
  on conflict (guest_key) do nothing;

  update public.guest_usage set last_generation_at = now(), updated_at = now()
  where guest_key = p_guest_key;
  return true;
end;
$$;

revoke execute on function public.claim_guest_generation(text) from public, anon, authenticated;
grant execute on function public.claim_guest_generation(text) to service_role;
