import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CancelSubscriptionButton } from "@/components/cancel-subscription-button";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";
import { creditsForTier } from "@/lib/domain/plans";
import { isUiLocale, localizedPath, type UiLocale } from "@/lib/i18n/locale";
import { getAuthContext } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("metadataTitle"), robots: { index: false, follow: false } };
}

export default async function BillingPage() {
  const rawLocale = await getLocale();
  const locale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = await getTranslations("billing");
  const auth = await getAuthContext();
  if (!auth.userId) {
    redirect(
      localizedPath(
        `/login?next=${encodeURIComponent(localizedPath("/account/billing", locale))}`,
        locale,
      ),
    );
  }
  const { data: subscription } = await (await createSupabaseServerClient())
    .from("subscriptions")
    .select("plan, tier, status, period_end, cancel_at_period_end")
    .eq("user_id", auth.userId)
    .maybeSingle();
  return (
    <main className="narrow-page">
      <SiteHeader initialAuth={auth} />
      <section className="account-heading">
        <div>
          <p className="eyebrow">{t("billing")}</p>
          <h1>{t("keepIdeasMoving")}</h1>
        </div>
      </section>
      <section className="billing-card">
        {subscription &&
        (auth.subscriptionState === "active" ||
          auth.subscriptionState === "canceling") ? (
          <>
            <div className="billing-top">
              <div>
                <p className="eyebrow">
                  {subscription.tier === "studio" ? t("studio") : t("creator")}{" "}
                  /{" "}
                  {subscription.plan === "yearly" ? t("yearly") : t("monthly")}
                </p>
                <h2>
                  {auth.subscriptionState === "canceling"
                    ? t("cancellationScheduled")
                    : t("active")}
                </h2>
              </div>
              <span className="billing-price">
                {creditsForTier(subscription.tier).toLocaleString(locale)}{" "}
                {t("creditsMonth")}
              </span>
            </div>
            <p>
              {t("periodEnds", {
                date: new Date(subscription.period_end).toLocaleDateString(
                  locale,
                  {
                    dateStyle: "long",
                  },
                ),
              })}
            </p>
            {auth.subscriptionState === "canceling" ? (
              <p className="form-message">{t("accessUntilPeriod")}</p>
            ) : (
              <CancelSubscriptionButton />
            )}
          </>
        ) : auth.subscriptionState === "ended" ? (
          <>
            <p className="eyebrow">{t("subscriptionEnded")}</p>
            <h2>{t("chooseNextPlan")}</h2>
            <p>{t("previousEnded")}</p>
            <Link className="solid-button" href="/pricing">
              {t("choosePlan")}
            </Link>
          </>
        ) : auth.subscriptionState === "past_due" ||
          auth.subscriptionState === "stale" ? (
          <>
            <p className="eyebrow">{t("needsAttention")}</p>
            <h2>{t("checkSubscription")}</h2>
            <p>{t("couldNotConfirm")}</p>
            <a className="solid-button" href="mailto:support@texttoposter.com">
              {t("contactSupport")}
            </a>
          </>
        ) : (
          <>
            <p className="eyebrow">{t("freeStudio")}</p>
            <h2>{t("startDirections")}</h2>
            <p>{t("upgradeDescription")}</p>
            <Link className="solid-button" href="/pricing">
              {t("seePlans")}
            </Link>
          </>
        )}
      </section>
      <section className="policy-note">
        <h2>{t("refunds")}</h2>
        <p>{t("refundPolicy")}</p>
        <a href="mailto:support@texttoposter.com">{t("contactSupport")}</a>
      </section>
    </main>
  );
}
