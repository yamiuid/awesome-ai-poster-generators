import { NextResponse } from "next/server";
import { z } from "zod";
import {
  type CreditPackPlan,
  creditPackFor,
  normalizeCheckoutPlan,
} from "@/lib/domain/plans";
import { localizedPath, UI_LOCALES, waffoLocaleFor } from "@/lib/i18n/locale";
import { requireUser } from "@/lib/server/auth";
import { getServerEnv } from "@/lib/server/env";
import { AppError, responseForError } from "@/lib/server/errors";
import { getWaffoClient } from "@/lib/server/waffo";
import { checkoutBlockFor } from "@/lib/server/waffo-subscription";

const checkoutSchema = z.object({
  plan: z.string().min(1),
  locale: z.enum(UI_LOCALES).default("en"),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const input = checkoutSchema.parse(await request.json());
    const env = getServerEnv();
    const pack = creditPackFor(input.plan);

    let productId: string | undefined;
    let metadata: Record<string, string>;
    let merchantExternalId: string;

    if (pack) {
      // 一次性积分包：不阻断订阅用户，允许订阅与积分包并存。
      const packProductIds: Readonly<
        Record<CreditPackPlan, string | undefined>
      > = {
        pack_starter: env.WAFFO_PACK_STARTER_PRODUCT_ID,
        pack_standard: env.WAFFO_PACK_STANDARD_PRODUCT_ID,
        pack_pro: env.WAFFO_PACK_PRO_PRODUCT_ID,
        pack_max: env.WAFFO_PACK_MAX_PRODUCT_ID,
      };
      const packProductId = packProductIds[pack.plan];
      if (!packProductId) {
        throw new AppError(
          "CHECKOUT_NOT_CONFIGURED",
          "This plan is not available yet.",
          503,
        );
      }
      productId = packProductId;
      metadata = {
        userId: user.userId,
        checkoutPlan: pack.plan,
        kind: "credit_pack",
        credits: String(pack.credits),
      };
      merchantExternalId = `texttoposter:${user.userId}:${pack.plan}`;
    } else {
      const checkoutBlock = checkoutBlockFor(user.subscriptionState);
      if (checkoutBlock) {
        throw new AppError(checkoutBlock.code, checkoutBlock.message, 409);
      }
      const selection = normalizeCheckoutPlan(input.plan);
      if (!selection) {
        return NextResponse.json(
          { error: "Choose a valid subscription plan.", code: "INVALID_PLAN" },
          { status: 400 },
        );
      }
      productId =
        selection.tier === "creator"
          ? selection.billingPeriod === "monthly"
            ? env.WAFFO_MONTHLY_PRODUCT_ID
            : env.WAFFO_YEARLY_PRODUCT_ID
          : selection.tier === "studio"
            ? selection.billingPeriod === "monthly"
              ? env.WAFFO_STUDIO_MONTHLY_PRODUCT_ID
              : env.WAFFO_STUDIO_YEARLY_PRODUCT_ID
            : selection.billingPeriod === "monthly"
              ? env.WAFFO_SCALE_MONTHLY_PRODUCT_ID
              : env.WAFFO_SCALE_YEARLY_PRODUCT_ID;
      if (!productId) {
        throw new AppError(
          "CHECKOUT_NOT_CONFIGURED",
          "This plan is not available yet.",
          503,
        );
      }
      metadata = {
        userId: user.userId,
        plan: selection.billingPeriod,
        tier: selection.tier,
        checkoutPlan: selection.checkoutPlan,
      };
      merchantExternalId = `texttoposter:${user.userId}:${selection.checkoutPlan}`;
    }

    const result = await getWaffoClient().checkout.authenticated.create({
      productId,
      currency: "USD",
      buyerIdentity: user.userId,
      ...(user.email ? { buyerEmail: user.email } : {}),
      language: waffoLocaleFor(input.locale),
      successUrl: `${env.NEXT_PUBLIC_APP_URL}${localizedPath("/checkout/success", input.locale)}`,
      orderMerchantExternalId: merchantExternalId,
      metadata,
    });
    return NextResponse.json({ checkoutUrl: result.checkoutUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Choose a valid plan.", code: "INVALID_PLAN" },
        { status: 400 },
      );
    }
    if (error instanceof AppError) {
      return responseForError(error);
    }
    return NextResponse.json(
      {
        error: "Checkout is temporarily unavailable.",
        code: "CHECKOUT_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
}
