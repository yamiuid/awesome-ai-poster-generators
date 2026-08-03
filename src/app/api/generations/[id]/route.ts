import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { responseForError } from "@/lib/server/errors";
import { pollGeneration } from "@/lib/server/generation-poll";
import type { GenerationActor } from "@/lib/server/generation-types";
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
    const actor: GenerationActor = {
      userId: auth.userId,
      guestKey: identity.key,
      mode: auth.userId ? (auth.isPro ? "pro" : "free") : "guest",
    };
    return Response.json(await pollGeneration(id, actor));
  } catch (error) {
    return responseForError(error);
  }
}
