"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { isUiLocale, localizedPath, type UiLocale } from "@/lib/i18n/locale";
import type { SubscriptionTier } from "@/lib/server/auth";
import { createSupabaseBrowserClient } from "@/lib/server/supabase/browser";

type Props = Readonly<{
  email: string | null;
  avatarUrl: string | null;
  tier: SubscriptionTier | null;
}>;

function Avatar({
  email,
  avatarUrl,
  size = 36,
}: Readonly<{
  email: string | null;
  avatarUrl: string | null;
  size?: number;
}>) {
  const initial = (email ?? "?").charAt(0).toUpperCase();
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className="user-menu-avatar-img"
        unoptimized
      />
    );
  }
  return (
    <span
      className="user-menu-avatar-initial"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export function UserMenu({ email, avatarUrl, tier }: Props) {
  const rawLocale = useLocale();
  const locale: UiLocale = isUiLocale(rawLocale) ? rawLocale : "en";
  const t = useTranslations("account");
  const tierLabel =
    tier === "creator"
      ? t("creator")
      : tier === "studio"
        ? t("studio")
        : t("free");
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function signOut(): Promise<void> {
    setSigningOut(true);
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      // ignore — clear client session regardless
    } finally {
      router.push(localizedPath("/", locale));
      router.refresh();
    }
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={email ? t("accountForEmail", { email }) : t("accountMenu")}
      >
        <Avatar email={email} avatarUrl={avatarUrl} />
      </button>
      {email && (
        <div className="user-menu-mobile-identity">
          <span className="user-menu-mobile-email">{email}</span>
          <span
            className={`tier-badge user-menu-mobile-tier is-${tier ?? "free"}`}
          >
            {tierLabel}
          </span>
        </div>
      )}
      <div className="user-menu-mobile-actions">
        <Link href="/account/billing">{t("billing")}</Link>
        <Link href="/account">{t("history")}</Link>
        <button
          type="button"
          className="user-menu-mobile-signout"
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          {signingOut ? t("signingOut") : t("signOut")}
        </button>
      </div>
      {open && (
        <div
          className="user-menu-dropdown"
          role="menu"
          aria-label={t("accountMenu")}
        >
          <div className="user-menu-identity">
            <Avatar email={email} avatarUrl={avatarUrl} size={40} />
            <div>
              <p className="user-menu-name">{email ?? t("signedIn")}</p>
              <span className={`tier-badge is-${tier ?? "free"}`}>
                {tierLabel}
              </span>
            </div>
          </div>
          <div className="user-menu-separator" />
          <Link
            href="/account/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            {t("billing")}
          </Link>
          <Link href="/account" role="menuitem" onClick={() => setOpen(false)}>
            {t("history")}
          </Link>
          <button
            type="button"
            role="menuitem"
            className="user-menu-signout"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            {signingOut ? t("signingOut") : t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
