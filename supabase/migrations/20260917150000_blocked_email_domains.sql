-- 反批量注册：邮箱域名黑名单 + Supabase「Before User Created」Hook。
--
-- 背景：2026-09-17 两小时内出现 15 个注册，全部落在 uberip.com / necub.com /
-- lnovic.com 这类「公共收件箱」域名，每个账号把 30 点 welcome 积分刚好用完。
-- 这类服务任何人都能读到任意地址的收件箱，所以 OTP 验证码拦不住它们。
--
-- 方案：把公开的 disposable-email 域名列表同步进 blocked_email_domains，
-- 再由 before_user_created hook 在「用户落库前」拒绝。hook 抛异常时 GoTrue
-- 直接返回错误且不创建用户，因此拿不到账号，也就拿不到 welcome 积分。
--
-- 同步任务见 /api/cron/blocklist-sync（每周一次，同时拉取
-- disposable-email-domains / mailchecker / fakefilter 三个清单；只增不删：
-- 域名列表基本只增长，而误伤一个已经废弃的一次性邮箱域名没有实际代价）。

create table if not exists public.blocked_email_domains (
  domain text primary key,
  reason text not null default 'disposable',
  source text not null default 'manual',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.blocked_email_domains is
  '注册邮箱域名黑名单；domain 为小写精确域名，匹配时会逐级去掉最左标签（a.b.com 也命中 b.com）。';

-- 只有 service_role（同步任务）与 hook（security definer）需要访问：
-- 开 RLS 且不建策略，anon / authenticated 一律读不到也写不了。
alter table public.blocked_email_domains enable row level security;

-- 2026-09-17 事故域名先落地，保证迁移执行后立刻生效（全量列表随后由 cron 补齐）。
insert into public.blocked_email_domains (domain, reason, source)
values
  ('uberip.com', 'disposable', 'incident-2026-09-17'),
  ('necub.com', 'disposable', 'incident-2026-09-17'),
  ('lnovic.com', 'disposable', 'incident-2026-09-17'),
  ('gmeenramy.com', 'disposable', 'incident-2026-09-17'),
  ('jobscai.com', 'disposable', 'incident-2026-09-17'),
  ('ruutukf.com', 'disposable', 'incident-2026-09-17'),
  ('yzcalo.com', 'disposable', 'incident-2026-09-17'),
  ('mondial.asso.st', 'disposable', 'incident-2026-09-17')
on conflict (domain) do nothing;

-- Before User Created hook。
--
-- 匹配规则：对 a.b.com 依次检查 a.b.com、b.com；顶级域（com）不参与匹配，
-- 避免把整片域名误伤。命中即抛 P0001，GoTrue 会把异常信息返回给客户端。
-- 消息前缀 EMAIL_DOMAIN_BLOCKED 是给前端的稳定标记（见 login-form.tsx）。
create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
  candidate text;
  blocked text;
begin
  if user_email = '' or position('@' in user_email) = 0 then
    -- 非邮箱注册（例如 OAuth 未返回邮箱）不受域名黑名单约束
    return '{}'::jsonb;
  end if;

  candidate := split_part(user_email, '@', 2);

  while position('.' in candidate) > 0 loop
    select b.domain into blocked
    from public.blocked_email_domains b
    where b.domain = candidate
      and b.active
    limit 1;

    if blocked is not null then
      raise exception
        'EMAIL_DOMAIN_BLOCKED: That email provider cannot be used to create an account. Please sign up with a permanent email address.'
        using errcode = 'P0001';
    end if;

    candidate := substring(candidate from position('.' in candidate) + 1);
  end loop;

  return '{}'::jsonb;
end;
$$;

comment on function public.before_user_created(jsonb) is
  'Supabase Auth「Before User Created」hook：命中域名黑名单时拒绝创建用户。';

revoke execute on function public.before_user_created(jsonb)
  from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
