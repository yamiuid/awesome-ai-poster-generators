import ky, { HTTPError } from "ky";
import { z } from "zod";
import {
  type GenerationRequest,
  normalizeReferenceImages,
  type ProviderQuality,
} from "@/lib/domain/poster";
import { getServerEnv } from "./env";
import { AppError } from "./errors";
import { createProxiedFetch } from "./proxy-fetch";

const submittedResponseSchema = z.object({
  code: z.number(),
  data: z.array(z.object({ status: z.string(), task_id: z.string() })).min(1),
});

const imageSchema = z.object({
  expires_at: z.number().optional(),
  url: z.array(z.string().url()).min(1),
});

/**
 * provider 的错误对象：code 既可能是数字（旧接口）也可能是字符串
 * （如 "task_failed"），只有 message 是稳定字段；param / type 等额外字段
 * 必须忽略。2026-09-17 事故：内容安全拒绝返回 code: "task_failed"，
 * 解析被 code 类型打挂，任务被误判成「服务无响应」超时。
 */
const providerErrorSchema = z
  .object({
    code: z.union([z.string(), z.number()]).optional(),
    message: z.string(),
  })
  .catchall(z.unknown());

const taskSchema = z
  .object({
    id: z.string(),
    // 刻意不用 enum：provider 新增状态时若解析直接失败，会被计成
    // poll_failures 并让仍在出图的任务被判超时。未知状态交给
    // providerTaskPhase 按「仍在处理」处理，由硬超时兜底。
    status: z.string(),
    progress: z.number().int().min(0).max(100).optional(),
    result: z.object({ images: z.array(imageSchema) }).optional(),
    error: providerErrorSchema.optional(),
    estimated_time: z.number().optional(),
  })
  .catchall(z.unknown());

const taskResponseSchema = z.object({ code: z.number(), data: taskSchema });

const chatCompletionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
});

export type ProviderTask = z.infer<typeof taskSchema>;
export type ProviderTaskPhase =
  | "working"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";
export type ProviderGenerationRequest = Omit<GenerationRequest, "quality"> &
  Readonly<{ quality: ProviderQuality }>;
export type ChatMessage = Readonly<{
  role: "system" | "user" | "assistant";
  content: string;
}>;

export function providerTaskPhase(status: string): ProviderTaskPhase {
  switch (status) {
    case "pending":
    case "processing":
      return "working";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

/**
 * provider 的内容审核拒绝统一返回 code: "task_failed"，只能靠 message 分辨。
 * 归一到稳定码，前端文案与后台聚合都只认这个码。
 */
const CONTENT_POLICY_PATTERN = /content safety|content policy|safety system/i;

/** 任务失败时写进 generations.error_code 的归因码，用于按原因聚合与告警。 */
export function providerErrorCode(task: ProviderTask): string {
  if (CONTENT_POLICY_PATTERN.test(task.error?.message ?? "")) {
    return "PROVIDER_CONTENT_POLICY";
  }
  const code = task.error?.code;
  if (typeof code === "string" && code.trim().length > 0) {
    return code.trim().slice(0, 64);
  }
  if (typeof code === "number") {
    return `code_${code}`;
  }
  return task.status === "cancelled" ? "TASK_CANCELLED" : "TASK_FAILED";
}

function summarizePayload(payload: unknown): string {
  try {
    return JSON.stringify(payload).slice(0, 500);
  } catch {
    return String(payload).slice(0, 500);
  }
}

/** 解析任务响应；失败返回 null，由调用方决定日志与错误语义。 */
export function parseProviderTaskResponse(
  payload: unknown,
): ProviderTask | null {
  const parsed = taskResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.data : null;
}

export class ApimartError extends AppError {
  constructor(message: string, status = 502, code = "APIMART_ERROR") {
    super(code, message, status);
    this.name = "ApimartError";
  }
}

/** 提交阶段被 provider 拒绝时，用响应体判断是不是内容审核。 */
function submitRejectionCode(data: unknown): string {
  if (typeof data === "string") {
    return CONTENT_POLICY_PATTERN.test(data)
      ? "PROVIDER_CONTENT_POLICY"
      : "APIMART_ERROR";
  }
  if (data && typeof data === "object") {
    return CONTENT_POLICY_PATTERN.test(JSON.stringify(data))
      ? "PROVIDER_CONTENT_POLICY"
      : "APIMART_ERROR";
  }
  return "APIMART_ERROR";
}

function client() {
  const env = getServerEnv();
  const options: Parameters<typeof ky.create>[0] = {
    prefix: "https://api.apimart.ai/v1/",
    headers: { Authorization: `Bearer ${env.APIMART_API_KEY}` },
    timeout: 30_000,
    retry: {
      limit: 2,
      methods: ["get"],
      statusCodes: [408, 429, 500, 502, 503, 504],
    },
  };
  // 本地开发网络无法直连 APIMart 时，可设 APIMART_PROXY / HTTPS_PROXY 走代理
  // （如 v2rayN 的 socks5://127.0.0.1:10909）。Workers 上不会配置这些变量，
  // 也不存在 undici 的原生 agent，见 proxy-fetch.ts。
  const proxiedFetch = createProxiedFetch();
  if (proxiedFetch) {
    options.fetch = proxiedFetch;
  }
  return ky.create(options);
}

export async function submitGeneration(
  request: ProviderGenerationRequest,
  prompt: string,
): Promise<Readonly<{ taskId: string }>> {
  try {
    const referenceUrls = normalizeReferenceImages(request);
    const response = await client()
      .post("images/generations", {
        json: {
          model: "gpt-image-2.5-flare",
          prompt,
          size: request.aspectRatio,
          resolution: request.resolution,
          quality: request.quality,
          output_format: "png",
          n: request.imageCount,
          // 参考图模式：带 image_urls 时 APIMart 走图生图，保持参考图作为视觉素材
          ...(referenceUrls.length ? { image_urls: referenceUrls } : {}),
        },
        retry: { limit: 0 },
      })
      .json<unknown>();

    const parsed = submittedResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ApimartError(
        "APIMart returned an unexpected submission response.",
      );
    }
    const first = parsed.data.data[0];
    if (!first) {
      throw new ApimartError("APIMart did not return a task ID.");
    }
    return { taskId: first.task_id };
  } catch (error) {
    if (error instanceof ApimartError) {
      throw error;
    }
    if (error instanceof HTTPError) {
      const status = error.response.status;
      if (status === 402) {
        throw new ApimartError("The image provider is out of credits.", 503);
      }
      if (status === 429) {
        throw new ApimartError(
          "The image provider is busy. Please try again shortly.",
          429,
        );
      }
      // 内容审核拒绝也是 4xx，但归因完全不同：用户改提示词/参考图就能过，
      // 不该被当成「服务异常」计数。
      if (submitRejectionCode(error.data) === "PROVIDER_CONTENT_POLICY") {
        throw new ApimartError(
          "The image service rejected this prompt or reference image on content policy grounds.",
          422,
          "PROVIDER_CONTENT_POLICY",
        );
      }
      throw new ApimartError("The image provider rejected this request.", 502);
    }
    throw error;
  }
}

export async function getTask(taskId: string): Promise<ProviderTask> {
  const response = await client()
    .get(`tasks/${encodeURIComponent(taskId)}`)
    .json<unknown>();
  const task = parseProviderTaskResponse(response);
  if (!task) {
    // 解析失败必须留痕：否则只会体现为 poll_failures 累加后的「服务无响应」，
    // 真实原因（provider 改了响应结构）无从排查。
    console.error("APIMart returned an unexpected task response", {
      taskId,
      payload: summarizePayload(response),
    });
    throw new ApimartError("APIMart returned an unexpected task response.");
  }
  return task;
}

export async function submitChatCompletion(input: {
  model: string;
  messages: readonly ChatMessage[];
  temperature?: number;
  timeoutMs?: number;
  responseFormatJson?: boolean;
}): Promise<string> {
  try {
    const response = await client()
      .post("chat/completions", {
        json: {
          model: input.model,
          messages: input.messages,
          temperature: input.temperature ?? 0.3,
          // APIMart 的 /v1/chat/completions 默认流式返回 SSE；显式关闭以按
          // 非流式 JSON 解析 choices[0].message.content
          stream: false,
          // gpt-5.4-nano 等 nano 型号不支持 response_format: json_object，
          // 会直接拒绝请求；提示词已要求“只输出 JSON”，parseLooseJson 也能
          // 容错提取，所以 nano 型号跳过该参数。
          ...(input.responseFormatJson &&
          !input.model.toLowerCase().includes("nano")
            ? { response_format: { type: "json_object" } }
            : {}),
        },
        timeout: input.timeoutMs ?? 30_000,
        retry: {
          limit: 1,
          methods: ["post"],
          statusCodes: [408, 429, 500, 502, 503, 504],
        },
      })
      .json<unknown>();
    const parsed = chatCompletionSchema.safeParse(response);
    if (!parsed.success) {
      throw new ApimartError("APIMart returned an unexpected chat response.");
    }
    const content = parsed.data.choices[0]?.message.content ?? "";
    if (!content) {
      throw new ApimartError("APIMart returned an empty chat response.");
    }
    return content;
  } catch (error) {
    if (error instanceof ApimartError) {
      throw error;
    }
    if (error instanceof HTTPError) {
      const status = error.response.status;
      if (status === 402) {
        throw new ApimartError("The text provider is out of credits.", 503);
      }
      if (status === 429) {
        throw new ApimartError(
          "The text provider is busy. Please try again shortly.",
          429,
        );
      }
      throw new ApimartError("The text provider rejected this request.", 502);
    }
    throw error;
  }
}
