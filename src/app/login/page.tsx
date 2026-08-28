import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Sign in or create an account | Text to Poster",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="narrow-page">
      <SiteHeader variant="minimal" />
      <section className="auth-card">
        <p className="eyebrow">Your studio, kept close</p>
        <h1>Sign in or create a free account.</h1>
        <p>
          Use Google or email. We&apos;ll send a 6-digit sign-in code, and your
          first email sign-in automatically creates a free account. Free
          accounts get a seven-day history and four poster images per UTC day;
          Pro removes the watermark and keeps high-definition exports private.
        </p>
        <LoginForm next={next} initialError={error} />
      </section>
    </main>
  );
}
