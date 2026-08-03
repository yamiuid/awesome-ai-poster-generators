export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function responseForError(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof Error) {
    console.error(error);
  }
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
