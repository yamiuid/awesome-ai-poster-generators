import { getLocale, getTranslations } from "next-intl/server";
import { StyleLandingPage } from "@/components/style-landing-page";
import { getStyleLanding } from "@/lib/domain/style-landing";
import { toUiLocale } from "@/lib/i18n/locale";
import { pageMeta } from "@/lib/seo";

const landing = getStyleLanding("neon-poster-generator");

export async function generateMetadata() {
  const locale = toUiLocale(await getLocale());
  const t = await getTranslations("styles");
  const style = t(landing.style);
  return pageMeta({
    title: t("metadataTitle", { style }),
    description: t("metadataDescription", { style }),
    path: `/${landing.slug}`,
    locale,
  });
}

export default function NeonPosterGeneratorPage() {
  return <StyleLandingPage landing={landing} />;
}
