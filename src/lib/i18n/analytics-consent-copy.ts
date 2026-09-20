import type { UiLocale } from "./locale";

export type AnalyticsConsentCopy = Readonly<{
  title: string;
  body: string;
  accept: string;
  decline: string;
  privacy: string;
  manage: string;
}>;

export const ANALYTICS_CONSENT_COPY: Readonly<
  Record<UiLocale, AnalyticsConsentCopy>
> = {
  en: {
    title: "Help us improve Text to Poster",
    body: "Allow optional analytics from Google and Microsoft Clarity. You can change this choice with Privacy settings.",
    accept: "Allow analytics",
    decline: "Not now",
    privacy: "Privacy details",
    manage: "Privacy settings",
  },
  "zh-TW": {
    title: "幫助我們改善 Text to Poster",
    body: "允許 Google 與 Microsoft Clarity 的選用分析。你可以透過隱私設定更改選擇。",
    accept: "允許分析",
    decline: "暫時不要",
    privacy: "查看隱私詳情",
    manage: "隱私設定",
  },
  ja: {
    title: "Text to Poster の改善に協力する",
    body: "Google と Microsoft Clarity の任意の分析を許可します。選択はプライバシー設定で変更できます。",
    accept: "分析を許可",
    decline: "今回は許可しない",
    privacy: "プライバシーの詳細",
    manage: "プライバシー設定",
  },
  es: {
    title: "Ayúdanos a mejorar Text to Poster",
    body: "Permite análisis opcionales de Google y Microsoft Clarity. Puedes cambiar esta elección en Configuración de privacidad.",
    accept: "Permitir análisis",
    decline: "Ahora no",
    privacy: "Detalles de privacidad",
    manage: "Configuración de privacidad",
  },
  ar: {
    title: "ساعدنا في تحسين Text to Poster",
    body: "اسمح بالتحليلات الاختيارية من Google وMicrosoft Clarity. يمكنك تغيير اختيارك من إعدادات الخصوصية.",
    accept: "السماح بالتحليلات",
    decline: "ليس الآن",
    privacy: "تفاصيل الخصوصية",
    manage: "إعدادات الخصوصية",
  },
};
