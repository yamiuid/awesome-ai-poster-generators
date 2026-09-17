import { getServerEnv } from "./env";

const ALERT_TIMEOUT_MS = 2_000;

/**
 * 运维告警出口。
 *
 * 默认只打结构化日志（`[alert]` 前缀，方便日志检索与 drain 规则）。
 * 配置 ALERT_WEBHOOK_URL 后会额外 POST 一条 `{ text }` JSON，
 * Slack incoming webhook、Discord webhook、飞书自定义机器人都接受该格式。
 *
 * 告警投递永远不能影响主流程：超时 2 秒，异常吞掉只记日志。
 */
export async function sendAlert(
  event: string,
  detail: Readonly<Record<string, unknown>>,
): Promise<void> {
  console.error(`[alert] ${event}`, detail);
  const url = getServerEnv().ALERT_WEBHOOK_URL;
  if (!url) {
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `[text-to-poster] ${event} ${JSON.stringify(detail)}`,
      }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[alert] delivery failed", {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
