import { z } from "zod";
import {
  detectTextLanguage,
  isAmbiguousLatinPrompt,
  PROMPT_LANGUAGES,
  type PromptLanguage,
} from "@/lib/domain/prompts";
import type { UiLocale } from "@/lib/i18n/locale";
import { ApimartError, submitChatCompletion } from "./apimart";
import { getServerEnv } from "./env";

const modelClassificationSchema = z.object({
  language: z.enum(["en", "es-419"]),
  confidence: z.number().min(0).max(1),
});

const classificationSchema = z.object({
  language: z.enum(PROMPT_LANGUAGES),
  confidence: z.number().min(0).max(1),
});

export type LanguageClassification = z.infer<typeof classificationSchema>;
export type PromptLanguageClassifier = (
  prompt: string,
) => Promise<LanguageClassification>;

const MIN_CONFIDENCE = 0.7;

async function classifyWithTextModel(
  prompt: string,
): Promise<LanguageClassification> {
  const raw = await submitChatCompletion({
    model: getServerEnv().APIMART_TEXT_MODEL,
    messages: [
      {
        role: "system",
        content:
          'Classify the primary natural language of the user prompt. Return only JSON with a "language" field (one of "en", "es-419") and a numeric "confidence" field from 0 to 1. For proper names, classify the surrounding language.',
      },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    timeoutMs: 5_000,
    responseFormatJson: true,
  });
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApimartError("The text classifier returned invalid JSON.");
    }
    throw error;
  }
  const parsed = modelClassificationSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApimartError("The text classifier returned an invalid language.");
  }
  return parsed.data;
}

export async function detectPosterLanguage(
  prompt: string,
  siteLocale: UiLocale = "en",
  classify: PromptLanguageClassifier = classifyWithTextModel,
): Promise<PromptLanguage> {
  const deterministic = detectTextLanguage(prompt, siteLocale);
  if (!isAmbiguousLatinPrompt(prompt)) {
    return deterministic;
  }
  try {
    const result = await classify(prompt);
    return result.confidence >= MIN_CONFIDENCE
      ? result.language
      : deterministic;
  } catch (error) {
    if (error instanceof Error) {
      console.warn("Prompt language classification failed", {
        error: error.name,
      });
    } else {
      console.warn("Prompt language classification failed", {
        error: "UnknownError",
      });
    }
    return deterministic;
  }
}
