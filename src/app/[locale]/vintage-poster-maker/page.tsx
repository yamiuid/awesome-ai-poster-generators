import { getTranslations } from "next-intl/server";
import { StyleStudioLanding } from "@/components/style-studio-landing";
import { getStyleLanding } from "@/lib/domain/style-landing";
import { resolveRouteLocale, type RouteParams } from "@/lib/i18n/route-locale";
import { pageMeta } from "@/lib/seo";

const landing = getStyleLanding("vintage-poster-maker");

/** 静态化开关：见 app/[locale]/page.tsx 的说明 */
export const dynamic = "force-static";

export async function generateMetadata({ params }: RouteParams) {
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations({ locale, namespace: "styles" });
  const style = t(landing.style);
  return pageMeta({
    title: t("metadataTitle", { style }),
    description: t("metadataDescription", { style }),
    path: `/${landing.slug}`,
    locale,
  });
}

export default async function VintagePosterMakerPage({ params }: RouteParams) {
  await resolveRouteLocale(params);
  return <StyleStudioLanding landing={landing} />;
}
