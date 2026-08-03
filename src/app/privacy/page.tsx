import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy | Text to Poster" };
export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
