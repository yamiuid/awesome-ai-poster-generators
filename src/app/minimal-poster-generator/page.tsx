import { StyleLandingPage } from "@/components/style-landing-page";
import { getStyleLanding } from "@/lib/domain/style-landing";
import { pageMeta } from "@/lib/seo";

const landing = getStyleLanding("minimal-poster-generator");

export const metadata = pageMeta({
  title: landing.title,
  description: landing.description,
  path: `/${landing.slug}`,
});

export default function MinimalPosterGeneratorPage() {
  return <StyleLandingPage landing={landing} />;
}
