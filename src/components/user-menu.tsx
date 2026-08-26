"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SubscriptionTier } from "@/lib/server/auth";
import { createSupabaseBrowserClient } from "@/lib/server/supabase/browser";

type Props = Readonly<{
  email: string | null;
  avatarUrl: string | null;
  tier: SubscriptionTier | null;
}>;

const TIER_LABEL: Readonly<Record<SubscriptionTier | "free", string>> = {
  free: "Free",
  creator: "Creator",
  studio: "Studio",
};

function tierLabel(tier: SubscriptionTier | null): string {
  return TIER_LABEL[tier ?? "free"];
}

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
      router.push("/");
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
        aria-label={email ? `Account menu for ${email}` : "Account menu"}
      >
        <Avatar email={email} avatarUrl={avatarUrl} />
      </button>
      {email && (
        <div className="user-menu-mobile-identity">
          <span className="user-menu-mobile-email">{email}</span>
          <span
            className={`tier-badge user-menu-mobile-tier is-${tier ?? "free"}`}
          >
            {tierLabel(tier)}
          </span>
        </div>
      )}
      {open && (
        <div className="user-menu-dropdown" role="menu" aria-label="Account">
          <div className="user-menu-identity">
            <Avatar email={email} avatarUrl={avatarUrl} size={40} />
            <div>
              <p className="user-menu-name">{email ?? "Signed in"}</p>
              <span className={`tier-badge is-${tier ?? "free"}`}>
                {tierLabel(tier)}
              </span>
            </div>
          </div>
          <div className="user-menu-separator" />
          <Link
            href="/account/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Billing
          </Link>
          <Link href="/account" role="menuitem" onClick={() => setOpen(false)}>
            My history
          </Link>
          <button
            type="button"
            role="menuitem"
            className="user-menu-signout"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
