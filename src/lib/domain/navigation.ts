import { stripLocalePrefix } from "@/lib/i18n/locale";

export const PRIMARY_NAV_ITEMS = [
  { key: "generators", label: "Generators", href: "/#studio" },
  { key: "examples", label: "Examples", href: "/#examples" },
  { key: "pricing", label: "Pricing", href: "/pricing" },
  { key: "about", label: "About", href: "/about" },
] as const;

export type PrimaryNavKey = (typeof PRIMARY_NAV_ITEMS)[number]["key"];

export function activePrimaryNav(pathname: string): PrimaryNavKey | null {
  const path = stripLocalePrefix(pathname);
  if (path === "/pricing") {
    return "pricing";
  }
  if (path === "/about") {
    return "about";
  }
  if (path.endsWith("-poster-maker") || path.endsWith("-poster-generator")) {
    return "generators";
  }
  return null;
}

export function loginRedirectPath(next: string | null | undefined): string {
  if (
    next === null ||
    next === undefined ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/auth")
  ) {
    return "/";
  }
  return next;
}
