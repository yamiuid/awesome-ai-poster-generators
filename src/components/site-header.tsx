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
import { stripLocalePrefix } from "@/lib/i18n/locale";
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
  showLocaleSwitcher?: boolean;
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
  mobileLocaleSlot,
}: Readonly<{
  account: HeaderAccount | null;
  mobileLocaleSlot?: React.ReactNode;
}>) {
  if (!account) {
    return <span className="header-account-loading" aria-hidden="true" />;
  }
  if (account.userId) {
    return (
      <UserMenu
        email={account.email}
        avatarUrl={account.avatarUrl}
        tier={account.tier}
        mobileLocaleSlot={mobileLocaleSlot}
      />
    );
  }
  return null;
}

/**
 * 积分余额 chip。
 *
 * 同一份标记渲染在两个位置：桌面端在导航条里（语言切换器右侧），
 * 移动端在顶栏汉堡按钮左侧。靠 CSS 决定哪个位置可见，两边共用同一份
 * 无障碍名称，键盘和读屏只会遇到当前可见的那一个。
 */
function HeaderCredits({
  credits,
  className,
  label,
}: Readonly<{ credits: number; className: string; label: string }>) {
  return (
    <Link className={className} href="/account" aria-label={label}>
      <Sparkles size={15} aria-hidden="true" />
      <span>{credits}</span>
    </Link>
  );
}

/**
 * 导航项。
 *
 * `/#studio`、`/#examples` 这类锚点在首页点击时走原生 `<a href="#…">`：
 * 浏览器直接滚动，不发起路由导航（Next 会把带 hash 的跳转当成一次页面导航，
 * 实测要等好几秒才更新 URL）。跨页时仍用 <Link> 做客户端跳转。
 */
function HeaderNavLink({
  item,
  active,
  onHome,
  children,
}: Readonly<{
  item: (typeof PRIMARY_NAV_ITEMS)[number];
  active: boolean;
  onHome: boolean;
  children: React.ReactNode;
}>) {
  const className = `header-nav-link${active ? " is-active" : ""}`;
  const ariaCurrent =
    active && item.key === "generators"
      ? ("location" as const)
      : active
        ? ("page" as const)
        : undefined;
  if (onHome && item.href.startsWith("/#")) {
    return (
      <a className={className} href={item.href.slice(1)} aria-current={ariaCurrent}>
        {children}
      </a>
    );
  }
  return (
    <Link className={className} href={item.href} aria-current={ariaCurrent}>
      {children}
    </Link>
  );
}

export function SiteHeader({
  variant = "global",
  initialAuth,
  showLocaleSwitcher = true,
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
        <span className="wordmark-label">Text to Poster</span>
      </Link>

      {variant === "global" && (
        <>
          <div className="header-mobile-actions">
            {account?.userId && account.credits !== null && (
              <HeaderCredits
                credits={account.credits ?? 0}
                className="header-credits"
                label={t("creditsBalance", { credits: account.credits ?? 0 })}
              />
            )}
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
          </div>

          <nav
            id="site-header-nav"
            className={`header-nav${open ? " is-open" : ""}${
              account?.userId ? " has-account" : ""
            }`}
            aria-label={t("primaryNavigation")}
          >
            {PRIMARY_NAV_ITEMS.map((item) => (
              <HeaderNavLink
                key={item.key}
                item={item}
                active={activeKey === item.key}
                onHome={pathname === "/" || stripLocalePrefix(pathname) === "/"}
              >
                {t(item.key)}
              </HeaderNavLink>
            ))}
            {showLocaleSwitcher && <LocaleSwitcher />}
            {account?.userId && account.credits !== null && (
              <HeaderCredits
                credits={account.credits ?? 0}
                className="header-credits"
                label={t("creditsBalance", { credits: account.credits ?? 0 })}
              />
            )}
            <HeaderAccount
              account={account}
              mobileLocaleSlot={
                showLocaleSwitcher ? (
                  <LocaleSwitcher idPrefix="account-locale-switcher" />
                ) : undefined
              }
            />
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
