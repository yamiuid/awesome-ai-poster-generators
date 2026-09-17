import { type NextRequest, NextResponse } from "next/server";
import { generationRequestSchema } from "@/lib/domain/poster";
import { getAuthContext } from "@/lib/server/auth";
import { AppError, responseForError } from "@/lib/server/errors";
import {
  createGeneration,
  getActorForRequest,
} from "@/lib/server/generation-create";
import { toGenerationAcceptedResponse } from "@/lib/server/generation-types";
import { getGuestIdentity, withGuestCookie } from "@/lib/server/guest";
import { isGuestGenerationRateLimited } from "@/lib/server/guest-throttle";

export async function POST(request: NextRequest): Promise<Response> {
  // 身份在进入 try 之前就确定：失败路径同样要把它固化到响应上
  const identity = getGuestIdentity(request);
  try {
    const body: unknown = await request.json();
    const parsed = generationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return withGuestCookie(
        NextResponse.json(
          {
            error: "Please check your poster description and options.",
            code: "INVALID_GENERATION_REQUEST",
          },
          { status: 400 },
        ),
        request,
        identity,
      );
    }

    const auth = await getAuthContext();
    if (!auth.userId && isGuestGenerationRateLimited(request)) {
      throw new AppError(
        "GUEST_RATE_LIMITED",
        "Too many guest generations from this network. Sign in or try again later.",
        429,
      );
    }
    // 积分包用户与订阅用户同享全档位 / 无水印 / 长保留期（pro 模式），
    // 点数仍从对应桶扣减，余额不足时由 reserve_credits 拒绝。
    const actor = getActorForRequest(
      auth.userId,
      identity,
      auth.isPro || auth.hasPack,
    );
    const generation = await createGeneration(actor, parsed.data);
    const response = NextResponse.json(
      toGenerationAcceptedResponse(generation),
      {
        status: 201,
      },
    );
    return withGuestCookie(response, request, identity);
  } catch (error) {
    const failure = responseForError(error);
    return withGuestCookie(
      new NextResponse(failure.body, {
        status: failure.status,
        headers: failure.headers,
      }),
      request,
      identity,
    );
  }
}
