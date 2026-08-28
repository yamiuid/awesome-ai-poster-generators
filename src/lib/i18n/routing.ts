import { defineRouting } from "next-intl/routing";
import { UI_LOCALES } from "@/lib/i18n/locale";

export const routing = defineRouting({
  locales: UI_LOCALES,
  defaultLocale: "en",
  localePrefix: "as-needed",
});
