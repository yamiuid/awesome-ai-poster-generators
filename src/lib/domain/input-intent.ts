export type InputType = "idea" | "url" | "text";

const URL_PATTERN = /^https?:\/\/[^\s]+$/;

export function isUrlInput(value: string): boolean {
  return URL_PATTERN.test(value.trim());
}

export function detectInputType(value: string): InputType {
  const trimmed = value.trim();
  if (URL_PATTERN.test(trimmed)) {
    return "url";
  }
  return trimmed.length >= 300 ? "text" : "idea";
}
