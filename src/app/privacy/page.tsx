import { LegalPage } from "@/components/legal-page";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Privacy | Text to Poster",
  description:
    "How Text to Poster collects, uses, stores, and deletes your data, and how to request access, correction, or deletion.",
  path: "/privacy",
});
export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
