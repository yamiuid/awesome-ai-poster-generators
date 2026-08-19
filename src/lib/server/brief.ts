import { z } from "zod";
import {
  type BriefFields,
  normalizeBriefFields,
  parseLooseJson,
} from "@/lib/domain/brief";
import { submitChatCompletion } from "./apimart";
import { getServerEnv } from "./env";
import { AppError } from "./errors";

export const briefRequestSchema = z.object({
  inputType: z.enum(["url", "text"]),
  content: z.string().trim().min(10).max(6000),
  sourceLabel: z.string().trim().max(200).optional(),
});

export type BriefRequest = z.infer<typeof briefRequestSchema>;

export async function createBrief(input: BriefRequest): Promise<BriefFields> {
  const env = getServerEnv();
  const systemPrompt =
    "You turn web page or article content into a concise poster brief. " +
    "Extract the single most important message and return ONLY JSON matching: " +
    '{"headline": string, "subtitle": string, "points": [3 strings], "cta": string}. ' +
    "Headline max 80 chars, subtitle max 120, each point max 120, cta max 120. " +
    "Keep the language crisp and poster-ready. " +
    "Write the brief in the same language as the source content: " +
    "if the content is in Chinese, write everything in Chinese; if English, in English. " +
    'If there is no clear call to action, use an empty string for "cta".';
  const userContent = [
    input.sourceLabel ? `Source: ${input.sourceLabel}` : "",
    input.content,
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

  let parsed: unknown;
  try {
    parsed = parseLooseJson(raw);
  } catch {
    throw new AppError(
      "BRIEF_PARSE_FAILED",
      "The content assistant returned an invalid brief.",
      502,
    );
  }
  const fields = normalizeBriefFields(parsed);
  if (!fields) {
    throw new AppError(
      "BRIEF_VALIDATION_FAILED",
      "The content assistant returned an incomplete brief.",
      502,
    );
  }
  return fields;
}
