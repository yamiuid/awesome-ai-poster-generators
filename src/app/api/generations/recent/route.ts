import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { responseForError } from "@/lib/server/errors";
import { getActorForRequest } from "@/lib/server/generation-create";
import { listRecentGenerations } from "@/lib/server/generation-poll";
import { getGuestIdentity } from "@/lib/server/guest";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const auth = await getAuthContext();
    const identity = getGuestIdentity(request);
    const actor = getActorForRequest(auth.userId, identity, auth.isPro);
    return Response.json(await listRecentGenerations(actor));
  } catch (error) {
    return responseForError(error);
  }
}
