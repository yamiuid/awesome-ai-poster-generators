import type { NextRequest } from "next/server";
import { z } from "zod";
import { analyzeUrlStream } from "@/lib/server/analyze";
import {
  clientIpFromRequest,
  createRateLimiter,
} from "@/lib/server/rate-limit";

const analyzeLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
});

const requestSchema = z.object({
  url: z.string().trim().min(4).max(2048),
});

export async function POST(request: NextRequest): Promise<Response> {
  const limited = analyzeLimiter.check(clientIpFromRequest(request));
  if (!limited.ok) {
    return Response.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: {
          "retry-after": String(Math.ceil(limited.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Please paste a valid link." },
      { status: 400 },
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Please paste a valid link." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const line of analyzeUrlStream(parsed.data.url, {
          signal: request.signal,
        })) {
          controller.enqueue(encoder.encode(line));
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              step: 0,
              status: "error",
              data: { message: "Something went wrong." },
            })}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
