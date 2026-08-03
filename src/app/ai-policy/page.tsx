import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "AI Use Policy | Text to Poster",
  description:
    "How Text to Poster labels AI-generated content, handles rights, and reviews harmful use.",
};

export default function AiPolicyPage() {
  return <LegalPage kind="ai-policy" />;
}
