import { AppError } from "./errors";
import type { GenerationActor } from "./generation-types";
import { ownsGeneration } from "./generation-types";
import { deletePoster } from "./storage";
import { createSupabaseAdminClient } from "./supabase/admin";

/**
 * 删除一次生成记录（用户手动清理历史）。
 *
 * 顺序：先删存储文件，再删 generations 行。
 * 先删文件是为了不留孤儿对象（隐私 + 存储成本）；这一步失败就直接报错让用户重试，
 * 此时数据库还没动，卡片和图片都还在，重试是无副作用的。
 *
 * 删行时由外键自动收尾：generated_assets / credit_reservations 级联删除，
 * credit_transactions.generation_id 置空——点数流水保留，只是不再关联到海报。
 */
export async function deleteGeneration(
  generationId: string,
  actor: GenerationActor,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: generation, error } = await admin
    .from("generations")
    .select("id, user_id, guest_key")
    .eq("id", generationId)
    .maybeSingle();
  if (error) {
    throw new AppError(
      "GENERATION_READ_FAILED",
      "We could not read that generation.",
      503,
    );
  }
  if (!generation || !ownsGeneration(generation, actor)) {
    throw new AppError(
      "GENERATION_NOT_FOUND",
      "That generation is not available.",
      404,
    );
  }

  const { data: assets } = await admin
    .from("generated_assets")
    .select("storage_path")
    .eq("generation_id", generationId);
  const paths = (assets ?? []).map((asset) => asset.storage_path);
  if (paths.length > 0) {
    await deletePoster(paths);
  }

  const { error: deleteError } = await admin
    .from("generations")
    .delete()
    .eq("id", generationId);
  if (deleteError) {
    // 文件已删、行还在：卡片会显示为图片缺失，用户重试删除即可收尾
    console.error("Generation row could not be deleted", {
      generationId,
      message: deleteError.message,
    });
    throw new AppError(
      "GENERATION_DELETE_FAILED",
      "We could not delete that generation. Please try again.",
      503,
    );
  }
}
