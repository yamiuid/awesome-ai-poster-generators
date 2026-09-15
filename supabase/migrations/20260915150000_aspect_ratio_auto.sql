-- 图生图 "匹配原图"：aspect_ratio 允许 "auto"（交给模型匹配参考图比例）

alter table public.generations drop constraint if exists generations_aspect_ratio_check;

alter table public.generations
  add constraint generations_aspect_ratio_check
  check (aspect_ratio in ('auto', '1:1', '4:5', '3:4', '2:3', '9:16', '16:9', '4:3', '3:2'));
