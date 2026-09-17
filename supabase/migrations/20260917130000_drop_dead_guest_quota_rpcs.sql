-- 清理：按次「认领 / 退还」访客额度的旧 RPC 已被
-- create_limited_generation / fail_limited_generation 完全取代。
--
-- 应用侧已无调用点（src 里只剩类型声明），数据库里也没有任何函数引用它们
-- （2026-09-17 用 pg_get_functiondef 全库核对过）。继续留着只会带来漂移风险：
-- release_guest_generation 内部还带着过时的「24 小时内才退还」守卫，谁误用一次
-- 就会重演「游客失败不退还额度」的 bug。

drop function if exists public.release_guest_generation(text);
drop function if exists public.claim_guest_generation(text);
