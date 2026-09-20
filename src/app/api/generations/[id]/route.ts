import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { responseForError } from "@/lib/server/errors";
import { getActorForRequest } from "@/lib/server/generation-create";
import { deleteGeneration } from "@/lib/server/generation-delete";
import { pollGeneration } from "@/lib/server/generation-poll";
import { getGuestIdentity } from "@/lib/server/guest";

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { id } = await context.params;
    const auth = await getAuthContext();
    const identity = getGuestIdentity(request);
    const actor = getActorForRequest(auth.userId, identity, auth.isPro);
    return Response.json(await pollGeneration(id, actor), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return responseForError(error);
  }
}

/** 删除一次生成记录（连同已生成的海报文件）。 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const { id } = await context.params;
    const auth = await getAuthContext();
    const identity = getGuestIdentity(request);
    const actor = getActorForRequest(auth.userId, identity, auth.isPro);
    await deleteGeneration(id, actor);
    return new Response(null, { status: 204 });
  } catch (error) {
    return responseForError(error);
  }
}
