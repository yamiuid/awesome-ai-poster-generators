import { getTranslations } from "next-intl/server";
import { StyleStudioLanding } from "@/components/style-studio-landing";
import { getStyleLanding } from "@/lib/domain/style-landing";
import { resolveRouteLocale, type RouteParams } from "@/lib/i18n/route-locale";
import { pageMeta } from "@/lib/seo";

const landing = getStyleLanding("minimal-poster-generator");

export async function generateMetadata({ params }: RouteParams) {
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations("styles");
  const style = t(landing.style);
  return pageMeta({
    title: t("metadataTitle", { style }),
    description: t("metadataDescription", { style }),
    path: `/${landing.slug}`,
    locale,
  });
}

export default async function MinimalPosterGeneratorPage({
  params,
}: RouteParams) {
  await resolveRouteLocale(params);
  return <StyleStudioLanding landing={landing} />;
}
