import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "@/app/globals.css";

const localTypeface = localFont({
  src: "./fonts/Geist-Regular.ttf",
  variable: "--font-local",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Page not found | Text to Poster",
  robots: { index: false, follow: false },
};

/**
 * 多根布局下没有唯一的 app/layout.tsx，404 由这个全局兜底页渲染，
 * 所以它必须自带完整的 html/body 与全局样式。
 */
export default function GlobalNotFound() {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${localTypeface.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <main className="legal-page">
          <article className="legal-copy">
            <p className="eyebrow">404</p>
            <h1>This page does not exist.</h1>
            <p>
              The link may be outdated or mistyped. Head back to the studio and
              start from there.
            </p>
            <p>
              <Link className="solid-button" href="/">
                Open the poster studio
              </Link>
            </p>
          </article>
        </main>
      </body>
    </html>
  );
}
