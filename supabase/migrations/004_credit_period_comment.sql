-- 设计意图说明：年付订阅积分按月发放（与月付周期步长一致）。
-- 这是有意设计，防止年付用户一次性获得大量积分后被滥用。
-- credits_granted 按 tier 区分：creator = 100/月，studio = 300/月。
-- 若未来需改为按年发放，需恢复 001 中的动态 period_step（plan='yearly' → 12 months）
-- 并相应调整 credits_granted。

comment on function public.reserve_credits(uuid, uuid, integer) is
  '预扣生成积分。年付与月付均按月周期发放（步长固定 1 个月），按 tier 区分额度（creator=100，studio=300）。周期切换时自动滚动 entitlement_periods。';

comment on function public.settle_credits(uuid, integer, integer) is
  '按实际成功图片数结算预扣积分，幂等（credit_transactions 唯一键）。成功图片为 0 时释放预扣。';
