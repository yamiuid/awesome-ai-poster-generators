-- 游客额度退还不再限制「必须在今天（UTC）之内」。
--
-- 退还分支是「按 UTC 日配额」时代留下的：只有 window_started_at 落在当天才退还。
-- 改成终身 2 次之后（见 20260915120000），window_started_at 只在首次生成时写入、
-- 之后不再滚动，于是「上一次生成发生在更早的某天、今天这次又失败」的游客会被
-- 静默吞掉一次额度：计数停在 2，前端再试直接 quota_exhausted。
-- （2026-09-17 复查线上函数时确认：window 为昨天的失败任务计数没有回落。）
--
-- 失败 = 没有交付任何图片，一律退还一次；只有真正把记录从非终态推进到终态
-- （返回 updated=true）时才退还，重复调用不会重复退还；计数下限为 0。

create or replace function public.fail_limited_generation(
  p_generation_id uuid,
  p_status text,
  p_message text
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  generation_row public.generations%rowtype;
  usage_row public.guest_usage%rowtype;
begin
  if p_status not in ('failed', 'timed_out') then
    raise exception 'invalid terminal generation status';
  end if;

  select * into generation_row
  from public.generations
  where id = p_generation_id
  for update;

  if not found or generation_row.status in ('succeeded', 'partially_succeeded', 'failed', 'timed_out') then
    return jsonb_build_object('updated', false);
  end if;

  if generation_row.guest_claimed_at is not null and generation_row.guest_limit_key is not null then
    select * into usage_row
    from public.guest_usage
    where guest_key = generation_row.guest_limit_key
    for update;

    if found then
      update public.guest_usage
      set generation_count = greatest(0, usage_row.generation_count - 1),
          last_generation_at = case
            when usage_row.generation_count > 1 then usage_row.last_generation_at
            else null
          end,
          window_started_at = case
            when usage_row.generation_count > 1 then usage_row.window_started_at
            else null
          end,
          updated_at = now()
      where guest_key = generation_row.guest_limit_key;
    end if;
  end if;

  update public.generations
  set status = p_status,
      error_message = p_message,
      progress = 100,
      completed_at = now(),
      reserved_credits = 0,
      guest_claimed_at = null
  where id = p_generation_id;

  return jsonb_build_object('updated', true);
end;
$$;

revoke execute on function public.fail_limited_generation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fail_limited_generation(uuid, text, text) to service_role;
