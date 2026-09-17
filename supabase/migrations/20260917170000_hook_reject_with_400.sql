-- 批量注册拦截：让 hook 返回 400 + 原文案，而不是抛异常。
--
-- 背景：20260917150000 的 before_user_created 用 raise exception 拒绝注册。
-- GoTrue 把 raise 变成 HTTP 500，而 supabase-js 对 5xx 会把 error.message 变成
-- "{}"（login-form.tsx 的 errorMessage() 里那条同名防护就是为这个写的），
-- 于是前端拿不到 EMAIL_DOMAIN_BLOCKED 标记，presentAuthError() 映射不到
-- emailDomainBlocked，用户看到的是兜底文案 "We could not send a code. Please try again."
--
-- 线上实测（2026-09-17）：带合法 captcha token 请求 POST /auth/v1/otp，
-- 命中域名返回 500 {"code":"P0001","message":"EMAIL_DOMAIN_BLOCKED: ..."}，
-- 浏览器里确实显示兜底文案，30 点 welcome 积分虽然拦住了，但提示是错的。
--
-- 官方 before_user_created 支持直接返回 error 对象：4xx 状态码 + message 会
-- 透传给客户端（见 docs/guides/auth/auth-hooks/before-user-created-hook Outputs）。
-- 换成这种返回方式后前端那条映射即可生效，同时也摆脱 5xx——
-- SDK 把 5xx 当可重试错误，4xx 不会。
create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
  candidate text;
begin
  if user_email = '' or position('@' in user_email) = 0 then
    -- 非邮箱注册（例如 OAuth 未返回邮箱）不受域名黑名单约束
    return '{}'::jsonb;
  end if;

  candidate := split_part(user_email, '@', 2);

  while position('.' in candidate) > 0 loop
    if exists (
      select 1
      from public.blocked_email_domains b
      where b.domain = candidate
        and b.active
    ) then
      -- 必须 return 而不是 raise，理由见文件头
      return jsonb_build_object(
        'error', jsonb_build_object(
          'http_code', 400,
          'message', 'EMAIL_DOMAIN_BLOCKED: That email provider cannot be used to create an account. Please sign up with a permanent email address.'
        )
      );
    end if;

    candidate := substring(candidate from position('.' in candidate) + 1);
  end loop;

  return '{}'::jsonb;
end;
$$;

comment on function public.before_user_created(jsonb) is
  'Supabase Auth「Before User Created」hook：命中域名黑名单时返回 400 + EMAIL_DOMAIN_BLOCKED 文案。不抛异常——抛异常 GoTrue 回 500，SDK 会把 message 丢成 "{}"，前端映射不到 emailDomainBlocked 文案。';

revoke execute on function public.before_user_created(jsonb)
  from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
