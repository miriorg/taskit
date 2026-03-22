import type { Revision } from "@/types";

export function getExpectedRevision(request: Request): Revision | undefined {
  const header = request.headers.get("if-match")?.trim();

  if (!header || header === "*") {
    return undefined;
  }

  return header;
}
