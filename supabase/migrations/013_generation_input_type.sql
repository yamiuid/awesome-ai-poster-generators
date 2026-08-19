-- 记录每次生成的输入类型（idea / url / text），用于按用户行为分析留存与付费。
alter table public.generations
  add column input_type text not null default 'idea';

alter table public.generations
  add constraint generations_input_type_check
  check (input_type in ('idea', 'url', 'text'));
