import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { getServerEnv } from "@/lib/server/env";
import { AppError, responseForError } from "@/lib/server/errors";
import { getWaffoClient } from "@/lib/server/waffo";

const checkoutSchema = z.object({ plan: z.enum(["monthly", "yearly"]) });

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const input = checkoutSchema.parse(await request.json());
    const env = getServerEnv();
    const productId =
      input.plan === "monthly"
        ? env.WAFFO_MONTHLY_PRODUCT_ID
        : env.WAFFO_YEARLY_PRODUCT_ID;
    const result = await getWaffoClient().checkout.authenticated.create({
      productId,
      currency: "USD",
      buyerIdentity: user.userId,
      ...(user.email ? { buyerEmail: user.email } : {}),
      successUrl: `${env.NEXT_PUBLIC_APP_URL}/checkout/success`,
      orderMerchantExternalId: `texttoposter:${user.userId}:${input.plan}`,
      metadata: { userId: user.userId, plan: input.plan },
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
