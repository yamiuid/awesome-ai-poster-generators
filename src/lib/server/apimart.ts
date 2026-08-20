import ky, { HTTPError } from "ky";
import type { Dispatcher } from "undici";
import { ProxyAgent, Socks5ProxyAgent, fetch as undiciFetch } from "undici";
import { z } from "zod";
import type { GenerationRequest, ProviderQuality } from "@/lib/domain/poster";
import { getServerEnv } from "./env";
import { AppError } from "./errors";

const submittedResponseSchema = z.object({
  code: z.number(),
  data: z.array(z.object({ status: z.string(), task_id: z.string() })).min(1),
});

const imageSchema = z.object({
  expires_at: z.number().optional(),
  url: z.array(z.string().url()).min(1),
});

const taskSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]),
  progress: z.number().int().min(0).max(100).optional(),
  result: z.object({ images: z.array(imageSchema) }).optional(),
  error: z
    .object({ code: z.number().optional(), message: z.string() })
    .optional(),
  estimated_time: z.number().optional(),
});

const taskResponseSchema = z.object({ code: z.number(), data: taskSchema });

const chatCompletionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
});

export type ProviderTask = z.infer<typeof taskSchema>;
export type ProviderGenerationRequest = Omit<GenerationRequest, "quality"> &
  Readonly<{ quality: ProviderQuality }>;
export type ChatMessage = Readonly<{
  role: "system" | "user" | "assistant";
  content: string;
}>;

export class ApimartError extends AppError {
  constructor(message: string, status = 502) {
    super("APIMART_ERROR", message, status);
    this.name = "ApimartError";
  }
}

let proxyDispatcher: Dispatcher | undefined;

function createProxyDispatcher(proxyUrl: string): Dispatcher {
  if (proxyUrl.trim().toLowerCase().startsWith("socks")) {
    // Socks5ProxyAgent 在代理端解析域名，可绕过本地被污染的 DNS
    return new Socks5ProxyAgent(proxyUrl);
  }
  return new ProxyAgent(proxyUrl);
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
  // （如 v2rayN 的 socks5://127.0.0.1:10909）。ky 的类型没收录 fetch-only 的
  // dispatcher，但运行时会把未知选项透传给 Node 的 fetch（undici）。
  const proxyUrl =
    process.env["APIMART_PROXY"] ??
    process.env["HTTPS_PROXY"] ??
    process.env["https_proxy"];
  if (proxyUrl) {
    if (!proxyDispatcher) {
      proxyDispatcher = createProxyDispatcher(proxyUrl);
    }
    const dispatcher = proxyDispatcher;
    // ky 的 fetch 选项换成 undici 自带的 fetch，并挂上代理 dispatcher
    // undici 8 的 fetch 不认 ky 传入的全局 Request 对象，这里重建成显式参数
    const proxiedFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const request =
        input instanceof globalThis.Request
          ? input
          : new globalThis.Request(String(input), init);
      const body =
        request.method === "GET" ||
        request.method === "HEAD" ||
        request.body === null
          ? undefined
          : Buffer.from(await request.arrayBuffer());
      return undiciFetch(request.url, {
        method: request.method,
        headers: request.headers,
        signal: request.signal,
        dispatcher,
        ...(body === undefined ? {} : { body }),
      } as unknown as Parameters<typeof undiciFetch>[1]);
    }) as unknown as typeof fetch;
    options.fetch = proxiedFetch;
  }
  return ky.create(options);
}

export async function submitGeneration(
  request: ProviderGenerationRequest,
  prompt: string,
): Promise<Readonly<{ taskId: string }>> {
  try {
    const response = await client()
      .post("images/generations", {
        json: {
          model: "gpt-image-2-official",
          prompt,
          size: request.aspectRatio,
          resolution: request.resolution,
          quality: request.quality,
          output_format: "png",
          n: request.imageCount,
          // 参考图模式：带 image_urls 时 APIMart 走图生图，保持网页原图作为视觉素材
          ...(request.referenceImageUrl
            ? { image_urls: [request.referenceImageUrl] }
            : {}),
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
      throw new ApimartError("The image provider rejected this request.", 502);
    }
    throw error;
  }
}

export async function getTask(taskId: string): Promise<ProviderTask> {
  const response = await client()
    .get(`tasks/${encodeURIComponent(taskId)}`)
    .json<unknown>();
  const parsed = taskResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new ApimartError("APIMart returned an unexpected task response.");
  }
  return parsed.data.data;
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
