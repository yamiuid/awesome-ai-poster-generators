import type { UiLocale } from "./locale";

export type LocaleBannerCopy = Readonly<{
  suggestion: string;
  view: string;
  dismiss: string;
}>;

/**
 * 语言建议条的文案，每条都用「目标语言本身」书写：
 * 英文站的访客看到的是自己浏览器语言的邀请，而不是英文问句。
 *
 * 这里没有放进 src/i18n/messages.ts：那份文件是全部语言的全量文案（约 190KB），
 * 而建议条是客户端组件（要读 navigator.language），引入它会把所有语言都打进浏览器包。
 * 5 种语言各 3 条短句放在这里，体积可以忽略；{language} 用目标语言名替换。
 */
export const LOCALE_BANNER_COPY: Readonly<Record<UiLocale, LocaleBannerCopy>> =
  {
    en: {
      suggestion:
        "This browser prefers {language}. View Text to Poster in {language}?",
      view: "Switch to {language}",
      dismiss: "Keep English",
    },
    "zh-TW": {
      suggestion:
        "此瀏覽器偏好{language}。要改用{language}版 Text to Poster 嗎？",
      view: "切換到{language}",
      dismiss: "維持英文",
    },
    ja: {
      suggestion:
        "このブラウザは{language}を優先しています。Text to Posterを{language}で表示しますか？",
      view: "{language}に切り替える",
      dismiss: "英語のまま",
    },
    es: {
      suggestion:
        "Este navegador prefiere {language}. ¿Ver Text to Poster en {language}?",
      view: "Cambiar a {language}",
      dismiss: "Mantener inglés",
    },
    ar: {
      suggestion:
        "يفضّل هذا المتصفح {language}. هل تريد عرض Text to Poster باللغة {language}؟",
      view: "التبديل إلى {language}",
      dismiss: "البقاء بالإنجليزية",
    },
  };
