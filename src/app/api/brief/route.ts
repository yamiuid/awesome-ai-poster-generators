import { type NextRequest, NextResponse } from "next/server";
import { briefRequestSchema, createBrief } from "@/lib/server/brief";
import { responseForError } from "@/lib/server/errors";
import {
  clientIpFromRequest,
  createRateLimiter,
} from "@/lib/server/rate-limit";

const briefLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
});

export async function POST(request: NextRequest): Promise<Response> {
  const limited = briefLimiter.check(clientIpFromRequest(request));
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
  try {
    const body: unknown = await request.json();
    const parsed = briefRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Please provide the content you want turned into a poster." },
        { status: 400 },
      );
    }
    const brief = await createBrief(parsed.data);
    return NextResponse.json(brief);
  } catch (error) {
    return responseForError(error);
  }
}
