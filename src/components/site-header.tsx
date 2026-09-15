"use client";

import ky from "ky";
import { ArrowUpRight, Menu, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { HeaderLoginDialog } from "@/components/header-login-dialog";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoMark } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";
import { Link } from "@/i18n/navigation";
import { activePrimaryNav, PRIMARY_NAV_ITEMS } from "@/lib/domain/navigation";
import type { AuthContext } from "@/lib/server/auth";
import { createSupabaseBrowserClient } from "@/lib/server/supabase/browser";

export type HeaderAccount = Readonly<
  Pick<AuthContext, "userId" | "email" | "avatarUrl" | "tier"> & {
    /** 服务端初始渲染时未知，客户端加载 status 后填充 */
    credits?: number | null;
  }
>;

type SiteHeaderProps = Readonly<{
  variant?: "global" | "minimal";
  initialAuth?: HeaderAccount;
}>;

const headerStatusSchema = z.object({
  signedIn: z.boolean(),
  subscription: z
    .object({ tier: z.enum(["creator", "studio"]).nullable() })
    .nullable()
    .optional(),
  balance: z
    .object({
      available: z.number(),
      bucket: z.enum(["subscription", "permanent"]),
    })
    .nullable()
    .optional(),
});

const EMPTY_HEADER_ACCOUNT: HeaderAccount = {
  userId: null,
  email: null,
  avatarUrl: null,
  tier: null,
  credits: null,
};

function accountFromUser(user: {
  id: string;
  email?: string;
  user_metadata: Record<string, unknown>;
}): HeaderAccount {
  const rawAvatar = user.user_metadata["avatar_url"];
  return {
    userId: user.id,
    email: user.email ?? null,
    avatarUrl: typeof rawAvatar === "string" ? rawAvatar : null,
    tier: null,
    credits: null,
  };
}

function useHeaderAccount(
  initialAuth: HeaderAccount | undefined,
): HeaderAccount | null {
  const [account, setAccount] = useState<HeaderAccount | null>(
    initialAuth ?? null,
  );

  useEffect(() => {
    let active = true;

    async function loadAccount(): Promise<void> {
      let base = EMPTY_HEADER_ACCOUNT;
      if (initialAuth) {
        // 服务端已给出登录态：先渲染，再异步补全积分余额
        base = initialAuth;
        setAccount(initialAuth);
      } else {
        try {
          const {
            data: { session },
          } = await createSupabaseBrowserClient().auth.getSession();
          if (!active) {
            return;
          }
          if (!session?.user) {
            setAccount(EMPTY_HEADER_ACCOUNT);
            return;
          }
          base = accountFromUser(session.user);
          setAccount(base);
        } catch (error) {
          if (!(error instanceof Error)) {
            throw error;
          }
          if (active) {
            setAccount(EMPTY_HEADER_ACCOUNT);
          }
          return;
        }
      }

      if (!base.userId) {
        return;
      }
      // 已登录：拉取订阅档位与积分余额（欢迎积分惰性领取也在这里触发）
      try {
        const rawStatus = await ky.get("/api/account/status").json<unknown>();
        const status = headerStatusSchema.parse(rawStatus);
        if (active && status.signedIn) {
          setAccount({
            ...base,
            tier: status.subscription?.tier ?? base.tier,
            credits: status.balance ? status.balance.available : null,
          });
        }
      } catch {
        // 状态获取失败保持基础登录态，积分 chip 暂不显示
      }
    }

    void loadAccount();
    return () => {
      active = false;
    };
  }, [initialAuth]);

  return account;
}

function HeaderAccount({
  account,
}: Readonly<{ account: HeaderAccount | null }>) {
  if (!account) {
    return <span className="header-account-loading" aria-hidden="true" />;
  }
  if (account.userId) {
    return (
      <UserMenu
        email={account.email}
        avatarUrl={account.avatarUrl}
        tier={account.tier}
      />
    );
  }
  return null;
}

export function SiteHeader({
  variant = "global",
  initialAuth,
}: SiteHeaderProps) {
  const t = useTranslations("header");
  const pathname = usePathname();
  const activeKey = activePrimaryNav(pathname);
  const account = useHeaderAccount(initialAuth);
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (
        headerRef.current &&
        !event.composedPath().includes(headerRef.current)
      ) {
        setOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("a")) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <header className="site-header" ref={headerRef}>
      <Link className="wordmark" href="/">
        <LogoMark className="wordmark-mark" />
        <span>Text to Poster</span>
      </Link>

      {variant === "global" && (
        <>
          <button
            type="button"
            className="header-menu-button"
            aria-expanded={open}
            aria-controls="site-header-nav"
            aria-label={open ? t("closeMenu") : t("openMenu")}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
          </button>

          <nav
            id="site-header-nav"
            className={`header-nav${open ? " is-open" : ""}`}
            aria-label={t("primaryNavigation")}
          >
            {PRIMARY_NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`header-nav-link${activeKey === item.key ? " is-active" : ""}`}
                aria-current={
                  activeKey === item.key
                    ? item.key === "generators"
                      ? "location"
                      : "page"
                    : undefined
                }
              >
                {t(item.key)}
              </Link>
            ))}
            <LocaleSwitcher />
            {account?.userId && account.credits !== null && (
              <Link
                className="header-credits"
                href="/account"
                aria-label={t("creditsBalance", {
                  credits: account.credits ?? 0,
                })}
              >
                <Sparkles size={15} aria-hidden="true" />
                <span>{account.credits}</span>
              </Link>
            )}
            <HeaderAccount account={account} />
            {account !== null && !account.userId && (
              <button
                type="button"
                className="header-cta"
                aria-controls="header-login-dialog"
                aria-expanded={loginOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setOpen(false);
                  setLoginOpen(true);
                }}
                data-umami-event={
                  pathname === "/movie-poster-maker"
                    ? "movie_cta_click"
                    : "header_cta_click"
                }
              >
                {t("freeToStart")} <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            )}
          </nav>
          <HeaderLoginDialog
            open={loginOpen}
            onClose={() => setLoginOpen(false)}
          />
        </>
      )}
    </header>
  );
}
