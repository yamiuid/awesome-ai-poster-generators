import { z } from "zod";
import { AppError } from "./errors";
import { createSupabaseAdminClient } from "./supabase/admin";

const failureResultSchema = z.object({ updated: z.boolean() });

export async function settleGenerationCredits(
  generationId: string,
  successfulImages: number,
  costPerImage: number,
  surcharge = 0,
): Promise<void> {
  const { error } = await createSupabaseAdminClient().rpc("settle_credits", {
    p_generation_id: generationId,
    p_successful_images: successfulImages,
    p_cost_per_image: costPerImage,
    // 参考图加价（每张 1 积分），仅在结算消费时收取。
    // 必须始终显式传参：库里曾因 create-or-replace 换签名而同时存在 3 参/4 参两个重载，
    // 少传一个参数会让 PostgREST 报 PGRST203「Could not choose the best candidate function」
    // （2026-09-16 事故：文生图全部结算失败、图片已生成却被标记 failed）。
    p_surcharge: surcharge,
  });
  if (error) {
    throw new AppError(
      "CREDIT_SETTLEMENT_FAILED",
      "We could not settle the credits for this generation.",
      503,
    );
  }
}

export async function failLimitedGeneration(
  generationId: string,
  status: "failed" | "timed_out",
  message: string,
  errorCode: string | null = null,
): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    "fail_limited_generation",
    {
      p_generation_id: generationId,
      p_status: status,
      p_message: message,
    },
  );
  if (error) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "We could not save the generation failure.",
      503,
    );
  }
  const parsed = failureResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(
      "GENERATION_STATE_FAILED",
      "The generation failure response was invalid.",
      503,
    );
  }
  // 归因码单独补写：fail_limited_generation 只接受状态与文案（改签名要动线上
  // RPC），而 error_code 列本就存在。写失败只影响统计，不能影响失败状态本身。
  if (errorCode && parsed.data.updated) {
    const { error: codeError } = await createSupabaseAdminClient()
      .from("generations")
      .update({ error_code: errorCode })
      .eq("id", generationId);
    if (codeError) {
      console.error("Could not record generation error code", {
        generationId,
        errorCode,
        message: codeError.message,
      });
    }
  }
  return parsed.data.updated;
}
