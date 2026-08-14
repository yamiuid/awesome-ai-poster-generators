import { z } from "zod";
import { AppError } from "./errors";
import { createSupabaseAdminClient } from "./supabase/admin";

const failureResultSchema = z.object({ updated: z.boolean() });

export async function settleGenerationCredits(
  generationId: string,
  successfulImages: number,
  costPerImage: number,
): Promise<void> {
  const { error } = await createSupabaseAdminClient().rpc("settle_credits", {
    p_generation_id: generationId,
    p_successful_images: successfulImages,
    p_cost_per_image: costPerImage,
  });
  if (error) {
    throw new AppError(
      "CREDIT_SETTLEMENT_FAILED",
      "We could not settle the credits for this generation.",
      503,
    );
  }
}

export async function releaseGuestGeneration(guestKey: string): Promise<void> {
  const { error } = await createSupabaseAdminClient().rpc(
    "release_guest_generation",
    { p_guest_key: guestKey },
  );
  if (error) {
    throw new AppError(
      "GUEST_RELEASE_FAILED",
      "We could not release the free generation allowance.",
      503,
    );
  }
}

export async function failLimitedGeneration(
  generationId: string,
  status: "failed" | "timed_out",
  message: string,
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
  return parsed.data.updated;
}
