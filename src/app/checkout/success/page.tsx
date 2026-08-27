import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { SubscriptionStatus } from "@/components/subscription-status";

export const metadata: Metadata = {
  title: "Payment received | Text to Poster",
  robots: { index: false, follow: false },
};

export default function CheckoutSuccessPage() {
  return (
    <main className="narrow-page">
      <header className="site-header">
        <Link className="wordmark" href="/">
          <LogoMark className="wordmark-mark" />
          <span>Text to Poster</span>
        </Link>
      </header>
      <section className="auth-card">
        <p className="eyebrow">Payment received</p>
        <h1>We are confirming your studio.</h1>
        <p>
          Waffo sends the verified payment event to us next. This page checks
          for confirmation automatically; you can safely leave it open.
        </p>
        <SubscriptionStatus />
      </section>
    </main>
  );
}
