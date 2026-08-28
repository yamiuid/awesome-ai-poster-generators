import { LegalPage } from "@/components/legal-page";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "AI Use Policy | Text to Poster",
  description:
    "How Text to Poster labels AI-generated content, handles rights, and reviews harmful or infringing use.",
  path: "/ai-policy",
  localizedAlternates: false,
});

export default function AiPolicyPage() {
  return <LegalPage kind="ai-policy" />;
}
