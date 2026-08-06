import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { responseForError } from "@/lib/server/errors";
import { advanceGenerationById } from "@/lib/server/generation-poll";
import type { GenerationActor } from "@/lib/server/generation-types";
import { getGuestIdentity } from "@/lib/server/guest";

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

// 推进生成任务（重活：查 APIMart + 下载/水印/上传）。
// 幂等：未到 next_poll_at 直接返回当前状态；cron maintenance 也做同样推进，双通道安全。
export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { id } = await context.params;
    const auth = await getAuthContext();
    const identity = getGuestIdentity(request);
    const actor: GenerationActor = {
      userId: auth.userId,
      guestKey: identity.key,
      mode: auth.userId ? (auth.isPro ? "pro" : "free") : "guest",
    };
    return Response.json(await advanceGenerationById(id, actor));
  } catch (error) {
    return responseForError(error);
  }
}
