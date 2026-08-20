import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { responseForError } from "@/lib/server/errors";
import { getActorForRequest } from "@/lib/server/generation-create";
import { giveUpGenerationById } from "@/lib/server/generation-poll";
import { getGuestIdentity } from "@/lib/server/guest";

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

// give-up 可能触发 provider 已完成时的正常落库（下载/水印/上传），给足超时
export const maxDuration = 300;

// 客户端连续推进失败后的主动放弃：结束卡住的任务并退还积分。
export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { id } = await context.params;
    const auth = await getAuthContext();
    const identity = getGuestIdentity(request);
    const actor = getActorForRequest(auth.userId, identity, auth.isPro);
    return Response.json(await giveUpGenerationById(id, actor));
  } catch (error) {
    return responseForError(error);
  }
}
