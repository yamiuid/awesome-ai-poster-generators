"use client";

import ky, { HTTPError } from "ky";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import type { CheckoutPlan } from "@/lib/domain/plans";
import { isUiLocale, localizedPath, type UiLocale } from "@/lib/i18n/locale";
import type { SubscriptionLifecycleState } from "@/lib/server/waffo-subscription";

type Props = Readonly<{
  plan: CheckoutPlan;
  subscriptionState: SubscriptionLifecycleState;
  isSignedIn: boolean;
  isConfigured: boolean;
}>;

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

  if (subscriptionState === "active" || subscriptionState === "canceling") {
    return (
      <Link className="outline-button" href="/account/billing">
        {t("manageSubscription")}
      </Link>
    );
  }
  if (subscriptionState === "past_due" || subscriptionState === "stale") {
    return (
      <Link className="outline-button" href="/account/billing">
        {t("billingNeedsAttention")}
      </Link>
    );
  }
  if (!isConfigured) {
    return (
      <button className="outline-button" type="button" disabled>
        {t("availableSoon")}
      </button>
    );
  }
  if (!isSignedIn) {
    return (
      <Link
        className="solid-button"
        href={`/login?next=${encodeURIComponent(localizedPath("/pricing", locale))}`}
      >
        {t("signInToStart")}
      </Link>
    );
  }

  return (
    <div className="pricing-action">
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
    </div>
  );
}

declare global {
  interface Window {
    umami?: Readonly<{ track: (event: string) => void }>;
  }
}
