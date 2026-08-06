-- 生成张数：Pro 可选 1-4 张，免费用户（guest/free）最多 2 张
alter table public.generations
  add column if not exists image_count integer not null default 4;
