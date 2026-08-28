import { type NextRequest, NextResponse } from "next/server";
import { generationRequestSchema } from "@/lib/domain/poster";
import { getAuthContext } from "@/lib/server/auth";
import { responseForError } from "@/lib/server/errors";
import {
  createGeneration,
  getActorForRequest,
} from "@/lib/server/generation-create";
import { toGenerationAcceptedResponse } from "@/lib/server/generation-types";
import { GUEST_COOKIE, getGuestIdentity } from "@/lib/server/guest";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = generationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error: "Please check your poster description and options.",
          code: "INVALID_GENERATION_REQUEST",
        },
        { status: 400 },
      );
    }

    const auth = await getAuthContext();
    const identity = getGuestIdentity(request);
    const actor = getActorForRequest(auth.userId, identity, auth.isPro);
    const generation = await createGeneration(actor, parsed.data);
    const response = NextResponse.json(
      toGenerationAcceptedResponse(generation),
      {
        status: 201,
      },
    );
    if (!request.cookies.has(GUEST_COOKIE)) {
      response.cookies.set(GUEST_COOKIE, identity.cookieValue, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    return response;
  } catch (error) {
    return responseForError(error);
  }
}
