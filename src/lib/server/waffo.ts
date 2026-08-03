import {
  verifyWebhook,
  WaffoPancake,
  type WebhookEvent,
  type WebhookEventData,
} from "@waffo/pancake-ts";
import { getServerEnv } from "./env";
import { AppError } from "./errors";

export function getWaffoClient(): WaffoPancake {
  const env = getServerEnv();
  return new WaffoPancake({
    merchantId: env.WAFFO_MERCHANT_ID,
    privateKey: env.WAFFO_PRIVATE_KEY,
  });
}

export function verifyWaffoWebhook(
  rawBody: string,
  signature: string | null,
): WebhookEvent<WebhookEventData> {
  const environment = getServerEnv().WAFFO_ENVIRONMENT;
  try {
    const event = verifyWebhook<WebhookEventData>(rawBody, signature, {
      environment,
    });
    if (event.mode !== environment) {
      throw new Error("Webhook environment mismatch.");
    }
    return event;
  } catch {
    throw new AppError(
      "WEBHOOK_INVALID",
      "The webhook signature could not be verified.",
      401,
    );
  }
}
