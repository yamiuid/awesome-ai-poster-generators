import {
  type BriefFields,
  normalizeBriefFields,
  parseLooseJson,
} from "@/lib/domain/brief";
import type { PageUnderstanding } from "@/lib/domain/url-analyze";
import { normalizePageUnderstanding } from "@/lib/domain/url-analyze";
import { submitChatCompletion } from "./apimart";
import { createBrief } from "./brief";
import { getServerEnv } from "./env";
import { AppError } from "./errors";
import {
  cleanBodyText,
  extractPage,
  fetchPageHtml,
  validatePageUrl,
} from "./url-preview";

type AnalyzeEvent =
  | {
      step: 1;
      status: "running" | "done" | "error";
      data?: { url: string; domain: string } | { message: string };
    }
  | {
      step: 2;
      status: "running" | "done" | "error";
      data?:
        | {
            status: number;
            contentType: string;
            byteLength: number;
            finalUrl: string;
          }
        | { message: string };
    }
  | {
      step: 3;
      status: "running" | "done" | "error";
      data?:
        | {
            title: string;
            description: string;
            siteName: string;
            ogImage?: string;
            favicon?: string;
            headings: readonly string[];
            contentLength: number;
          }
        | { message: string };
    }
  | {
      step: 4;
      status: "running" | "done" | "error";
      data?: { length: number; excerpt: string } | { message: string };
    }
  | {
      step: 5;
      status: "running" | "done" | "error";
      data?: PageUnderstanding | { message: string };
    }
  | {
      step: 6;
      status: "running" | "done" | "error";
      data?: BriefFields | { message: string };
    }
  | { step: 0; status: "complete"; data: { brief: BriefFields } };

function errorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  return "Something went wrong while processing this page.";
}

async function understandPage(input: {
  title: string;
  description: string;
  content: string;
  headings: readonly string[];
}): Promise<PageUnderstanding> {
  const env = getServerEnv();
  const systemPrompt =
    "You analyze a web page and return a compact content understanding. " +
    "Return ONLY JSON matching: " +
    '{"pageType": string, "topic": string, "audience": string, "primaryMessage": string, "keyPoints": [3 strings]}. ' +
    "pageType is one of: article, product, event, news, landing_page, announcement, report, other. " +
    "Keep primaryMessage under 500 chars and each keyPoint under 200 chars. " +
    "Respond in the same language as the article content: " +
    "if the content is in Chinese, write everything in Chinese; if English, in English.";
  const userContent = [
    `Title: ${input.title}`,
    input.description ? `Description: ${input.description}` : "",
    `Headings:\n${input.headings.join("\n")}`,
    `Content:\n${input.content}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const raw = await submitChatCompletion({
    model: env.APIMART_TEXT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent.slice(0, 7000) },
    ],
    temperature: 0.3,
    timeoutMs: 8_000,
    responseFormatJson: true,
  });
  const parsed = parseLooseJson(raw);
  const result = normalizePageUnderstanding(parsed);
  if (!result) {
    throw new AppError(
      "ANALYZE_UNDERSTANDING_INVALID",
      "The content assistant returned an invalid understanding.",
      502,
    );
  }
  return result;
}

export async function* analyzeUrlStream(
  rawUrl: string,
  options?: { signal?: AbortSignal },
): AsyncGenerator<string, void, unknown> {
  const abort = options?.signal;
  const line = (event: AnalyzeEvent): string => `${JSON.stringify(event)}\n`;
  const fail = (step: 1 | 2 | 3 | 4 | 5 | 6, error: unknown): string =>
    line({ step, status: "error", data: { message: errorMessage(error) } });
  const stopped = (): boolean => abort?.aborted ?? false;

  let url: URL;
  yield line({ step: 1, status: "running" });
  try {
    url = validatePageUrl(rawUrl);
  } catch (error) {
    yield fail(1, error);
    return;
  }
  yield line({
    step: 1,
    status: "done",
    data: { url: url.toString(), domain: url.hostname },
  });
  if (stopped()) {
    return;
  }

  let page: Awaited<ReturnType<typeof fetchPageHtml>>;
  yield line({ step: 2, status: "running" });
  try {
    page = await fetchPageHtml(url, abort ? { signal: abort } : {});
  } catch (error) {
    yield fail(2, error);
    return;
  }
  yield line({
    step: 2,
    status: "done",
    data: {
      status: page.status,
      contentType: page.contentType,
      byteLength: page.byteLength,
      finalUrl: page.finalUrl.toString(),
    },
  });
  if (stopped()) {
    return;
  }

  const extracted = extractPage(page.html, page.finalUrl.toString());
  yield line({ step: 3, status: "running" });
  yield line({
    step: 3,
    status: "done",
    data: {
      title: extracted.title,
      description: extracted.description,
      siteName: extracted.siteName,
      ...(extracted.ogImage ? { ogImage: extracted.ogImage } : {}),
      ...(extracted.favicon ? { favicon: extracted.favicon } : {}),
      headings: [...extracted.headings],
      contentLength: extracted.content.length,
    },
  });
  if (stopped()) {
    return;
  }

  const cleaned = cleanBodyText(extracted.content);
  yield line({ step: 4, status: "running" });
  yield line({
    step: 4,
    status: "done",
    data: { length: cleaned.length, excerpt: cleaned.slice(0, 200) },
  });
  if (stopped()) {
    return;
  }

  let understanding: PageUnderstanding;
  yield line({ step: 5, status: "running" });
  try {
    understanding = await understandPage({
      title: extracted.title,
      description: extracted.description,
      content: extracted.content,
      headings: [...extracted.headings],
    });
  } catch (error) {
    yield fail(5, error);
    return;
  }
  yield line({ step: 5, status: "done", data: understanding });
  if (stopped()) {
    return;
  }

  let brief: BriefFields;
  yield line({ step: 6, status: "running" });
  try {
    brief = await createBrief({
      inputType: "url",
      content: [extracted.title, extracted.description, extracted.content]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 6000),
      sourceLabel: page.finalUrl.hostname,
    });
  } catch (error) {
    yield fail(6, error);
    return;
  }
  const normalized = normalizeBriefFields(brief);
  if (!normalized) {
    yield fail(
      6,
      new AppError(
        "BRIEF_VALIDATION_FAILED",
        "The brief could not be prepared.",
        502,
      ),
    );
    return;
  }
  yield line({ step: 6, status: "done", data: normalized });
  yield line({ step: 0, status: "complete", data: { brief: normalized } });
}
