-- credit_grants.source 原本只允许 welcome / credit_pack，
-- 2026-09-16 结算事故需要给受影响用户补发善意积分，放宽到允许 'goodwill'。
alter table public.credit_grants
  drop constraint if exists credit_grants_source_check;

alter table public.credit_grants
  add constraint credit_grants_source_check
  check (source in ('welcome', 'credit_pack', 'goodwill'));
