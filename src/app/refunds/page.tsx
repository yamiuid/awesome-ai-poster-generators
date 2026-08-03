import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Refunds | Text to Poster" };
export default function RefundsPage() {
  return <LegalPage kind="refunds" />;
}
