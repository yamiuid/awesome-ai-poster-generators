import { getLocale, getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isUiLocale } from "@/lib/i18n/locale";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata() {
  const rawLocale = await getLocale();
  const locale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = await getTranslations("about");
  return pageMeta({
    title: `${t("title")} | Text to Poster`,
    description: t("intro"),
    path: "/about",
    locale,
  });
}

export default async function AboutPage() {
  const t = await getTranslations("about");
  return (
    <main className="legal-page">
      <SiteHeader />
      <article className="legal-copy">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="legal-intro">{t("intro")}</p>
        <section>
          <h2>{t("whyTitle")}</h2>
          <p>{t("whyBody")}</p>
        </section>
        <section>
          <h2>{t("howTitle")}</h2>
          <p>{t("howBody")}</p>
        </section>
        <section>
          <h2>{t("careTitle")}</h2>
          <p>{t("careBody")}</p>
        </section>
        <section>
          <h2>{t("behindTitle")}</h2>
          <p>{t("behindBody")}</p>
        </section>
        <section>
          <h2>{t("transparencyTitle")}</h2>
          <p>{t("transparencyBody")}</p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
