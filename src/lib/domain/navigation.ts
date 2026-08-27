export function loginRedirectPath(next: string | null | undefined): string {
  if (
    next === null ||
    next === undefined ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/auth")
  ) {
    return "/";
  }
  return next;
}
