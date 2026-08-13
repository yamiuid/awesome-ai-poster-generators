import { LegalPage } from "@/components/legal-page";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Refunds | Text to Poster",
  description:
    "Text to Poster refund policy: eligibility within 7 days, how to request a refund, and what happens to unused credits.",
  path: "/refunds",
});
export default function RefundsPage() {
  return <LegalPage kind="refunds" />;
}
