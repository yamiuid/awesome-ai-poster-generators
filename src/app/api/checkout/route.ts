import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeCheckoutPlan } from "@/lib/domain/plans";
import { requireUser } from "@/lib/server/auth";
import { getServerEnv } from "@/lib/server/env";
import { AppError, responseForError } from "@/lib/server/errors";
import { getWaffoClient } from "@/lib/server/waffo";

const checkoutSchema = z.object({ plan: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const input = checkoutSchema.parse(await request.json());
    const selection = normalizeCheckoutPlan(input.plan);
    if (!selection) {
      return NextResponse.json(
        { error: "Choose a valid subscription plan." },
        { status: 400 },
      );
    }
    const env = getServerEnv();
    const productId =
      selection.tier === "creator"
        ? selection.billingPeriod === "monthly"
          ? env.WAFFO_MONTHLY_PRODUCT_ID
          : env.WAFFO_YEARLY_PRODUCT_ID
        : selection.billingPeriod === "monthly"
          ? env.WAFFO_STUDIO_MONTHLY_PRODUCT_ID
          : env.WAFFO_STUDIO_YEARLY_PRODUCT_ID;
    if (!productId) {
      throw new AppError(
        "CHECKOUT_NOT_CONFIGURED",
        "This plan is not available yet.",
        503,
      );
    }
    const result = await getWaffoClient().checkout.authenticated.create({
      productId,
      currency: "USD",
      buyerIdentity: user.userId,
      ...(user.email ? { buyerEmail: user.email } : {}),
      successUrl: `${env.NEXT_PUBLIC_APP_URL}/checkout/success`,
      orderMerchantExternalId: `texttoposter:${user.userId}:${selection.checkoutPlan}`,
      metadata: {
        userId: user.userId,
        plan: selection.billingPeriod,
        tier: selection.tier,
        checkoutPlan: selection.checkoutPlan,
      },
    });
    return NextResponse.json({ checkoutUrl: result.checkoutUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Choose a valid subscription plan." },
        { status: 400 },
      );
    }
    if (error instanceof AppError) {
      return responseForError(error);
    }
    return NextResponse.json(
      { error: "Checkout is temporarily unavailable." },
      { status: 503 },
    );
  }
}
