-- 修复：settle_credits 存在两个重载（3 参数版来自 001，4 参数版来自 20260915120000_reference_images），
-- 而 4 参数版带 DEFAULT 0，导致 PostgREST 无法为「3 个具名参数」的调用挑选函数：
--   HTTP 300 PGRST203: Could not choose the best candidate function between ...
-- 后果（2026-09-16 事故）：结算 RPC 抛错 → finalizeCompleted 失败 → 文生图（无参考图、surcharge=0）
-- 一律在「图片已下载/加水印/已写 generated_assets」之后被标记 failed，
-- 且 failGeneration 里的释放预扣同样走 3 参数调用 → 预扣永久停在 reserved。
--
-- 001 里的 3 参数版本语义与 4 参数版（surcharge 默认 0）完全一致，直接删除冗余重载即可：
-- 之后所有 3 参数调用都会解析到带 DEFAULT 的 4 参数版本。
drop function if exists public.settle_credits(uuid, integer, integer);

-- 同一类隐患：create_limited_generation 也有 12 参（001）与 13 参带 DEFAULT（20260915120000）两个重载。
-- 当前之所以没炸，只是因为调用方总是显式传 p_reference_count；一旦有人少传一个参数就会同样报 PGRST203。
-- 删掉旧签名，让 12 参调用解析到带 DEFAULT 的新签名。
drop function if exists public.create_limited_generation(
  uuid, text, text, text, text, text, text, text, text, integer, text, integer
);
