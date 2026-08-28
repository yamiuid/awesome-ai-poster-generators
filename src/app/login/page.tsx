import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { SiteHeader } from "@/components/site-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("metadataTitle"), robots: { index: false, follow: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <main className="narrow-page">
      <SiteHeader variant="minimal" />
      <section className="auth-card">
        <p className="eyebrow">{t("signInHeading")}</p>
        <h1>{t("signInHeading")}</h1>
        <p>{t("signInBody")}</p>
        <LoginForm next={next} initialError={error} />
      </section>
    </main>
  );
}
