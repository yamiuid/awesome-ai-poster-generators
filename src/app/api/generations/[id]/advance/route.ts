import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { responseForError } from "@/lib/server/errors";
import { getActorForRequest } from "@/lib/server/generation-create";
import { advanceGenerationById } from "@/lib/server/generation-poll";
import { getGuestIdentity } from "@/lib/server/guest";

// 下载/水印/上传是重活，给足超时（Hobby 上限 60s，Pro 可更长）
export const maxDuration = 60;

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
    const actor = getActorForRequest(auth.userId, identity, auth.isPro);
    return Response.json(await advanceGenerationById(id, actor));
  } catch (error) {
    return responseForError(error);
  }
}
