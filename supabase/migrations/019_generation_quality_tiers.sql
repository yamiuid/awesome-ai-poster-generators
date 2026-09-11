-- 质量档位扩展到 GPT Image 2.5 Flare / Sunburst 的 超高(xhigh) / 最高(max)
alter table public.generations
  drop constraint if exists generations_quality_check;

alter table public.generations
  add constraint generations_quality_check check (
    quality in ('low', 'medium', 'high', 'xhigh', 'max')
  );
