import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in | Text to Poster",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="narrow-page">
      <header className="site-header">
        <a className="wordmark" href="/">
          <span className="wordmark-mark">T</span>
          <span>Text to Poster</span>
        </a>
      </header>
      <section className="auth-card">
        <p className="eyebrow">Your studio, kept close</p>
        <h1>Sign in to save your directions.</h1>
        <p>
          Use Google or a magic link. Your free account gets a seven-day
          history; Pro removes the watermark and keeps high-definition exports
          private.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
