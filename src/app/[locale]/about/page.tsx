import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveRouteLocale, type RouteParams } from "@/lib/i18n/route-locale";
import { pageMeta } from "@/lib/seo";

/** 静态化开关：见 app/[locale]/page.tsx 的说明 */
export const dynamic = "force-static";

export async function generateMetadata({ params }: RouteParams) {
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations({ locale, namespace: "about" });
  return pageMeta({
    title: `${t("title")} | Text to Poster`,
    description: t("intro"),
    path: "/about",
    locale,
  });
}

export default async function AboutPage({ params }: RouteParams) {
  await resolveRouteLocale(params);
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
