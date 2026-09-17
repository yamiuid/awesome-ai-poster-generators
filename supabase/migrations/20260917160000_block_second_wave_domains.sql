-- 反批量注册：第二批事故域名（2026-09-17 下午）。
--
-- 背景：blocked_email_domains + before_user_created hook 上线（迁移
-- 20260917150000）之后，13:51–14:21 CST 又出现 5 个注册。域名换成了
-- imagesthere.com / prominentghost.com 的随机二级子域（dc. / 86. / q2. /
-- 34. / pk.）以及 tempmaile.edu.rs。这三个域名都不在同步的三个公开清单里
-- （disposable-email-domains / mailchecker / fakefilter 均未收录），所以 hook
-- 放行，账号照旧在几分钟内把 30 点 welcome 积分用完。
--
-- 归因依据与前一批一致——邮箱形如 `<名字><6 位十六进制>@<随机二级子域>.<域名>`，
-- 提示词全是 "Create a poster for : <通用标题>"，quality=low、2:3、单图。
-- 两个域名的 MX 都指向自家 `mx.<域名>`（catch-all），注册商 Namecheap DNS。
--
-- 只补域名，不引入新机制：hook 逐级去掉最左标签后再匹配，因此封
-- imagesthere.com / prominentghost.com 即可覆盖全部随机子域。
-- 注意不要封 edu.rs —— 那是塞尔维亚教育域，按主机名精确封 tempmaile.edu.rs。
insert into public.blocked_email_domains (domain, reason, source)
values
  ('imagesthere.com', 'disposable', 'incident-2026-09-17-wave2'),
  ('prominentghost.com', 'disposable', 'incident-2026-09-17-wave2'),
  ('tempmaile.edu.rs', 'disposable', 'incident-2026-09-17-wave2')
on conflict (domain) do nothing;

-- 本批 6 个账号（含 wave1 封禁扫描之后、本批之前注册的 tempmaile 账号）已在
-- 线上按上一批同样的方式封禁（auth.users.banned_until = now() + 100 年）。
-- 账号封禁不进迁移：新环境重放时这些账号并不存在。
--   dyvmghilpf@tempmaile.edu.rs           2026-09-17 13:15 CST
--   corenda92daef@dc.imagesthere.com      2026-09-17 13:51 CST  (30 点 / 16 次)
--   miguelita92dd22@34.prominentghost.com 2026-09-17 14:01 CST  (30 点 / 15 次)
--   thalassa92deb1@86.imagesthere.com     2026-09-17 14:07 CST  (30 点 / 15 次)
--   stacie92e035@q2.imagesthere.com       2026-09-17 14:14 CST  (30 点 / 15 次)
--   bethena92e1cf@pk.prominentghost.com   2026-09-17 14:21 CST  (4 点 / 3 次，封禁时仍在跑)
