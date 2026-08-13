import { StyleLandingPage } from "@/components/style-landing-page";
import { getStyleLanding } from "@/lib/domain/style-landing";
import { pageMeta } from "@/lib/seo";

const landing = getStyleLanding("movie-poster-maker");

export const metadata = pageMeta({
  title: landing.title,
  description: landing.description,
  path: `/${landing.slug}`,
});

export default function MoviePosterMakerPage() {
  return <StyleLandingPage landing={landing} />;
}
