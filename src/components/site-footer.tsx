import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { LogoMark } from "@/components/logo";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("footer");
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <p className="site-footer-brand-logo">
          <LogoMark className="site-footer-brand-mark" />
          <span>Text to Poster</span>
        </p>
        <p className="site-footer-brand-tagline">{t("tagline")}</p>
        <a
          className="site-footer-brand-email"
          href="mailto:support@texttoposter.com"
        >
          support@texttoposter.com
        </a>
      </div>
      <div className="site-footer-groups">
        <div className="site-footer-group">
          <span className="site-footer-label">{t("generators")}</span>
          <nav aria-label={t("generators")}>
            <Link href="/">{t("aiPosterGenerator")}</Link>
            <Link href="/movie-poster-maker">{t("moviePosterGenerator")}</Link>
            <Link href="/business-poster-generator">
              {t("businessPosterGenerator")}
            </Link>
          </nav>
        </div>
        <div className="site-footer-group">
          <span className="site-footer-label">{t("site")}</span>
          <nav aria-label={t("site")}>
            <Link href="/about">{t("about")}</Link>
            <NextLink href="/privacy">{t("privacy")}</NextLink>
            <NextLink href="/terms">{t("terms")}</NextLink>
            <NextLink href="/refunds">{t("refunds")}</NextLink>
            <NextLink href="/ai-policy">{t("aiUse")}</NextLink>
          </nav>
        </div>
        <div className="site-footer-group">
          <span className="site-footer-label">{t("friendlyLinks")}</span>
          <nav aria-label={t("friendlyLinks")}>
            <a href="https://www.ai138.com" target="_blank" rel="noreferrer">
              Ai138
            </a>
            <a href="https://dang.ai" target="_blank" rel="noreferrer">
              Dang！
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
