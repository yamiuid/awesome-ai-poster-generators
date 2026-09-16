-- 图生图参考图跨设备：generations 记录参考图 URL。
--
-- 只加列，不动 create_limited_generation 的签名：该函数已有 12 参旧重载，
-- 新增带默认值的参数会让 12 参调用变成歧义调用。
-- 服务端在生成行创建后单独 UPDATE 写入，与 input_type 一样属于不阻断生成的补写。

alter table public.generations
  add column if not exists reference_urls text[] not null default '{}';
