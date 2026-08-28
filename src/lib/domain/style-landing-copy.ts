import type { UiLocale } from "@/lib/i18n/locale";
import type { StyleLanding } from "./style-landing";

type StyleLandingCopy = Pick<
  StyleLanding,
  "h1" | "intro" | "promptLead" | "promptTips" | "cta" | "faqs"
>;

export function getStyleLandingCopy(
  locale: UiLocale,
  style: string,
  landing: StyleLanding,
): StyleLandingCopy {
  if (locale === "en") {
    return landing;
  }

  if (locale === "zh-TW") {
    return {
      h1: `${style}海報生成器——把想法變成海報方向`,
      intro: `用幾句文字描述你的${style}海報，快速比較多個版面、色彩與文字方向，再挑選最適合的版本。`,
      promptLead: `一份好的${style}海報簡報可以包含：`,
      promptTips: [
        "海報的主題、活動或故事，以及希望觀眾記住的重點。",
        "想要的氣氛與視覺參考，例如沉靜、活潑、專業或懷舊。",
        "兩到三種主色，或描述品牌需要延續的色彩。",
        "必須出現的標題、日期、地點或行動呼籲，文字盡量簡短。",
        "使用情境與尺寸比例，例如社群貼文、印刷傳單或螢幕。",
      ],
      cta: `描述你的活動、作品或主題，生成多個${style}海報方向並比較看看。`,
      faqs: [
        [
          `${style}海報可以從文字建立嗎？`,
          `可以。先寫下主題、氣氛與必須出現的文字，工作室會提供多個${style}版面供你比較。`,
        ],
        [
          "應該在提示詞中加入哪些文字？",
          "加入已確認的標題、日期與短句即可。生成後請仔細檢查文字、數字、名稱與標誌。",
        ],
        [
          `${style}海報適合使用什麼比例？`,
          "依照使用場景選擇直式、方形或橫式；印刷與社群貼文通常需要不同尺寸。",
        ],
      ],
    };
  }

  if (locale === "ja") {
    return {
      h1: `${style}ポスタージェネレーター——アイデアをポスターに`,
      intro: `短い文章で${style}ポスターのテーマを説明し、レイアウトや色、文字の方向性を複数比較できます。`,
      promptLead: `${style}ポスターのブリーフには、次の内容を入れてみてください。`,
      promptTips: [
        "テーマ、イベント、物語と、見る人に覚えてほしいポイント。",
        "静か、明るい、プロフェッショナル、懐かしいなどの雰囲気。",
        "使いたい2〜3色、またはブランドに合わせたい色。",
        "入れたいタイトル、日付、場所、CTA。文章は短くまとめます。",
        "用途と比率。SNS、印刷、画面など、使う場所を指定します。",
      ],
      cta: `イベントや作品の内容を説明して、複数の${style}ポスター案を比較してみましょう。`,
      faqs: [
        [
          `${style}ポスターは文章から作れますか？`,
          `はい。テーマ、雰囲気、入れたい文字を入力すると、複数の${style}レイアウトを比較できます。`,
        ],
        [
          "プロンプトにどんな文字を入れるとよいですか？",
          "確定したタイトル、日付、短いコピーを入れてください。生成後は文字や数字、固有名詞を必ず確認します。",
        ],
        [
          `${style}ポスターにはどの比率が合いますか？`,
          "用途に合わせて縦長、正方形、横長から選びます。印刷物とSNSでは適したサイズが異なります。",
        ],
      ],
    };
  }

  if (locale === "es") {
    return {
      h1: `Generador de pósters ${style}: convierte una idea en un póster`,
      intro: `Describe tu póster ${style} con unas frases y compara varias direcciones de composición, color y tipografía antes de elegir una.`,
      promptLead: `Un buen brief para un póster ${style} puede incluir:`,
      promptTips: [
        "El tema, evento o historia y la idea que quieres que el público recuerde.",
        "El ambiente: sereno, enérgico, profesional, nostálgico o el que necesites.",
        "Dos o tres colores principales o una referencia de color de marca.",
        "El título, la fecha, el lugar o la llamada a la acción que deben aparecer.",
        "El contexto y el formato: publicación social, impresión o pantalla.",
      ],
      cta: `Describe tu evento, proyecto o tema y genera varias direcciones de póster ${style} para compararlas.`,
      faqs: [
        [
          `¿Puedo crear un póster ${style} desde texto?`,
          `Sí. Escribe el tema, el ambiente y el texto imprescindible para comparar varias composiciones ${style}.`,
        ],
        [
          "¿Qué texto debo incluir en el prompt?",
          "Incluye el título, la fecha y una frase breve si ya están definidos. Revisa después las palabras, cifras, nombres y logotipos.",
        ],
        [
          `¿Qué formato funciona mejor para un póster ${style}?`,
          "Elige vertical, cuadrado u horizontal según el lugar donde se verá: cada canal necesita una proporción distinta.",
        ],
      ],
    };
  }

  return {
    h1: `مولّد ملصقات ${style}: حوّل فكرتك إلى ملصق`,
    intro: `صف ملصق ${style} في بضع جمل وقارن بين اتجاهات متعددة للتكوين والألوان والنص قبل اختيار النسخة المناسبة.`,
    promptLead: `يمكن أن يتضمن وصف ملصق ${style} الجيد ما يلي:`,
    promptTips: [
      "الموضوع أو الفعالية أو القصة، والفكرة التي تريد أن يتذكرها الجمهور.",
      "الأجواء المطلوبة: هادئة أو حيوية أو احترافية أو حنينية.",
      "لونان أو ثلاثة ألوان أساسية، أو ألوان العلامة التجارية.",
      "العنوان والتاريخ والمكان وعبارة الحث على الإجراء التي يجب أن تظهر.",
      "مكان الاستخدام ونسبة الأبعاد، مثل منشور اجتماعي أو مطبوعة أو شاشة.",
    ],
    cta: `صف فعالية أو مشروعًا أو موضوعًا وأنشئ عدة اتجاهات لملصق ${style} لمقارنتها.`,
    faqs: [
      [
        `هل يمكن إنشاء ملصق ${style} من نص؟`,
        `نعم. اكتب الموضوع والأجواء والنص الأساسي لمقارنة عدة تكوينات ${style}.`,
      ],
      [
        "ما النص الذي يجب إضافته إلى الوصف؟",
        "أضف العنوان والتاريخ وعبارة قصيرة عند توفرها. راجع الكلمات والأرقام والأسماء والشعارات بعد التوليد.",
      ],
      [
        `ما النسبة المناسبة لملصق ${style}؟`,
        "اختر الوضع الطولي أو المربع أو الأفقي بحسب مكان العرض؛ فالمطبوعات والشبكات الاجتماعية تحتاج إلى نسب مختلفة.",
      ],
    ],
  };
}
