import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { SiteHeader } from "@/components/site-header";
import { resolveRouteLocale, type RouteParams } from "@/lib/i18n/route-locale";

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  await resolveRouteLocale(params);
  const t = await getTranslations("auth");
  return { title: t("metadataTitle"), robots: { index: false, follow: false } };
}

export default async function LoginPage({
  params,
  searchParams,
}: RouteParams & {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  await resolveRouteLocale(params);
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
