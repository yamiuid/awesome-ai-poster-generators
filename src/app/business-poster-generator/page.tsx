import { getLocale, getTranslations } from "next-intl/server";
import { StyleStudioLanding } from "@/components/style-studio-landing";
import { getStyleLanding } from "@/lib/domain/style-landing";
import { toUiLocale } from "@/lib/i18n/locale";
import { pageMeta } from "@/lib/seo";

const landing = getStyleLanding("business-poster-generator");

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

export default function BusinessPosterGeneratorPage() {
  return <StyleStudioLanding landing={landing} />;
}
