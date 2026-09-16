"use client";

import ky, { HTTPError } from "ky";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { CheckoutPlan, CreditPackPlan } from "@/lib/domain/plans";
import { isUiLocale, localizedPath, type UiLocale } from "@/lib/i18n/locale";
import type { SubscriptionLifecycleState } from "@/lib/server/waffo-subscription";

type Props = Readonly<{
  plan: CheckoutPlan | CreditPackPlan;
  subscriptionState: SubscriptionLifecycleState;
  isSignedIn: boolean;
  isConfigured: boolean;
}>;

function isPackPlan(
  plan: CheckoutPlan | CreditPackPlan,
): plan is CreditPackPlan {
  return plan.startsWith("pack_");
}

/**
 * 所有分支都套同一层 .pricing-action：
 * 间距由 .plan-card .pricing-action 提供，免费卡片用的是同一个类，
 * 早期分支直接返回裸按钮会让"Sign in to start"贴住上方文案。
 */
function ActionSlot({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="pricing-action">{children}</div>;
}

export function PricingAction({
  plan,
  subscriptionState,
  isSignedIn,
  isConfigured,
}: Props) {
  const rawLocale = useLocale();
  const locale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = useTranslations("pricing");
  const checkoutT = useTranslations("checkout");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showArabicCheckoutNotice, setShowArabicCheckoutNotice] =
    useState(false);

  async function startCheckout(): Promise<void> {
    setLoading(true);
    setError(null);
    setNotice(null);
    window.umami?.track("checkout_started");
    try {
      const result = await ky
        .post("/api/checkout", { json: { plan, locale } })
        .json<Readonly<{ checkoutUrl: string }>>();
      const checkoutWindow = window.open(
        result.checkoutUrl,
        "_blank",
        "noopener,noreferrer",
      );
      if (!checkoutWindow) {
        window.location.assign(result.checkoutUrl);
      } else {
        setLoading(false);
        setNotice(t("checkoutOpened"));
      }
    } catch (checkoutError) {
      if (checkoutError instanceof HTTPError) {
        setError(t("checkoutCouldNotStart"));
      } else {
        setError(t("checkoutCouldNotStart"));
      }
      setNotice(null);
      setLoading(false);
    }
  }

  // 积分包是一次性购买：订阅状态不影响购买（订阅用户也可买包）
  const pack = isPackPlan(plan);
  if (
    !pack &&
    (subscriptionState === "active" || subscriptionState === "canceling")
  ) {
    return (
      <ActionSlot>
        <Link className="outline-button" href="/account/billing">
          {t("manageSubscription")}
        </Link>
      </ActionSlot>
    );
  }
  if (
    !pack &&
    (subscriptionState === "past_due" || subscriptionState === "stale")
  ) {
    return (
      <ActionSlot>
        <Link className="outline-button" href="/account/billing">
          {t("billingNeedsAttention")}
        </Link>
      </ActionSlot>
    );
  }
  if (!isConfigured) {
    return (
      <ActionSlot>
        <button className="outline-button" type="button" disabled>
          {t("availableSoon")}
        </button>
      </ActionSlot>
    );
  }
  if (!isSignedIn) {
    return (
      <ActionSlot>
        <Link
          className="solid-button"
          href={`/login?next=${encodeURIComponent(localizedPath("/pricing", locale))}`}
        >
          {t("signInToStart")}
        </Link>
      </ActionSlot>
    );
  }

  return (
    <ActionSlot>
      <button
        className="solid-button"
        type="button"
        onClick={() => {
          if (locale === "ar") {
            setShowArabicCheckoutNotice(true);
          } else {
            void startCheckout();
          }
        }}
        disabled={loading}
      >
        {loading
          ? t("openingCheckout")
          : pack
            ? plan === "pack_starter"
              ? t("buyPackStarter")
              : plan === "pack_standard"
                ? t("buyPackStandard")
                : t("buyPackValue")
            : plan === "creator_monthly"
              ? t("startCreatorMonthly")
              : plan === "creator_yearly"
                ? t("chooseCreatorYearly")
                : plan === "studio_monthly"
                  ? t("startStudioMonthly")
                  : t("chooseStudioYearly")}
      </button>
      {showArabicCheckoutNotice && (
        <div className="checkout-locale-notice" role="alert">
          <p>{checkoutT("checkoutEnglish")}</p>
          <div className="modal-actions">
            <button
              className="outline-button"
              type="button"
              onClick={() => setShowArabicCheckoutNotice(false)}
            >
              {checkoutT("close")}
            </button>
            <button
              className="solid-button"
              type="button"
              onClick={() => {
                setShowArabicCheckoutNotice(false);
                void startCheckout();
              }}
            >
              {t("continueToCheckout")}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-message is-success" role="status">
          {notice}
        </p>
      )}
    </ActionSlot>
  );
}

declare global {
  interface Window {
    umami?: Readonly<{ track: (event: string) => void }>;
  }
}
