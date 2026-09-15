import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { AppError, responseForError } from "@/lib/server/errors";
import { getGuestIdentity } from "@/lib/server/guest";
import { createReferenceUrl, uploadReference } from "@/lib/server/storage";
import {
  assertReferenceImage,
  isUploadRateLimited,
  referenceExtension,
} from "@/lib/server/uploads";

// 单次请求最多 5 张，与 generationRequestSchema 的 MAX_REFERENCE_IMAGES 对齐
const MAX_FILES_PER_REQUEST = 5;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const auth = await getAuthContext();
    const identity = getGuestIdentity(request);
    const actorKey = auth.userId ?? `guest:${identity.key}`;
    if (isUploadRateLimited(actorKey)) {
      throw new AppError(
        "UPLOAD_RATE_LIMITED",
        "Too many uploads in a short time. Please wait a moment.",
        429,
      );
    }

    const formData = await request.formData();
    const files = formData
      .getAll("file")
      .filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) {
      throw new AppError(
        "INVALID_REFERENCE_FILE",
        "Attach at least one image file.",
        400,
      );
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      throw new AppError(
        "INVALID_REFERENCE_FILE",
        "Attach at most 5 images per request.",
        400,
      );
    }

    const uploaded: string[] = [];
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      let mime: string;
      try {
        // 魔数嗅探真实类型，不信任请求的 Content-Type
        mime = await assertReferenceImage(bytes);
      } catch (error) {
        throw new AppError(
          "INVALID_REFERENCE_FILE",
          error instanceof Error
            ? error.message
            : "The reference image must be a JPEG, PNG or WebP up to 10MB.",
          400,
        );
      }
      // 路径全部服务端生成，无用户可控字符串
      const path = `references/${actorKey}/${randomUUID()}.${referenceExtension(mime)}`;
      await uploadReference(path, bytes, mime);
      uploaded.push(await createReferenceUrl(path));
    }

    return NextResponse.json({ urls: uploaded }, { status: 201 });
  } catch (error) {
    return responseForError(error);
  }
}
