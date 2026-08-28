import { LegalPage } from "@/components/legal-page";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Terms | Text to Poster",
  description:
    "The terms for using Text to Poster, including your responsibility for prompts, generated output, rights, and AI disclosure.",
  path: "/terms",
  localizedAlternates: false,
});
export default function TermsPage() {
  return <LegalPage kind="terms" />;
}
