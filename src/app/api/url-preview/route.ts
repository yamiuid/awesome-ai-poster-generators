import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { responseForError } from "@/lib/server/errors";
import {
  clientIpFromRequest,
  createRateLimiter,
} from "@/lib/server/rate-limit";
import { fetchUrlPreview } from "@/lib/server/url-preview";

const urlPreviewLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
});

const requestSchema = z.object({
  url: z.string().trim().min(4).max(2048),
});

export async function POST(request: NextRequest): Promise<Response> {
  const limited = urlPreviewLimiter.check(clientIpFromRequest(request));
  if (!limited.ok) {
    return Response.json(
      { error: "Too many page reads. Try again later." },
      {
        status: 429,
        headers: {
          "retry-after": String(Math.ceil(limited.retryAfterMs / 1000)),
        },
      },
    );
  }
  try {
    const body: unknown = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Please paste a valid link." },
        { status: 400 },
      );
    }
    const preview = await fetchUrlPreview(parsed.data.url);
    return NextResponse.json(preview);
  } catch (error) {
    return responseForError(error);
  }
}
