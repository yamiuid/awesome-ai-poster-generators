import Link from "next/link";
import { LogoMark } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <p className="site-footer-brand-logo">
          <LogoMark className="site-footer-brand-mark" />
          <span>Text to Poster</span>
        </p>
        <p className="site-footer-brand-tagline">
          AI poster maker — turn an idea, text, or link into poster directions.
        </p>
        <a
          className="site-footer-brand-email"
          href="mailto:support@texttoposter.com"
        >
          support@texttoposter.com
        </a>
      </div>
      <div className="site-footer-groups">
        <div className="site-footer-group">
          <span className="site-footer-label">Site</span>
          <nav aria-label="Site links">
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/refunds">Refunds</Link>
            <Link href="/ai-policy">AI use</Link>
          </nav>
        </div>
        <div className="site-footer-group">
          <span className="site-footer-label">Friendly links</span>
          <nav aria-label="Friendly links">
            <a href="https://www.ai138.com" target="_blank" rel="noreferrer">
              Ai138
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
