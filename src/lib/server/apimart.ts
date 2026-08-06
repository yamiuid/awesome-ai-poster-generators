import ky, { HTTPError } from "ky";
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

export type ProviderTask = z.infer<typeof taskSchema>;
export type ProviderGenerationRequest = Omit<GenerationRequest, "quality"> &
  Readonly<{ quality: ProviderQuality }>;

export class ApimartError extends AppError {
  constructor(message: string, status = 502) {
    super("APIMART_ERROR", message, status);
    this.name = "ApimartError";
  }
}

function client() {
  const env = getServerEnv();
  return ky.create({
    prefix: "https://api.apimart.ai/v1/",
    headers: { Authorization: `Bearer ${env.APIMART_API_KEY}` },
    timeout: 30_000,
    retry: {
      limit: 2,
      methods: ["get"],
      statusCodes: [408, 429, 500, 502, 503, 504],
    },
  });
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
