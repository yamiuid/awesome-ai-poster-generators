-- 连续推进失败的次数：provider 暂时不可用时先重试，超过上限后结束任务，
-- 避免前端长时间停留在“生成中/重连”状态。
alter table public.generations
  add column poll_failures integer not null default 0;
