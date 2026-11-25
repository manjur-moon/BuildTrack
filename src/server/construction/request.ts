import { ApiError } from "@/server/api/errors";
import { parseInput } from "@/server/api/validation";
import { entityIdSchema } from "./input";

/** Protects custom cookie-authenticated mutation routes from cross-origin form/fetch requests. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new ApiError(403, "FORBIDDEN", "Origin header required for mutations.");
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) throw new Error("cross-origin");
  } catch {
    throw new ApiError(403, "FORBIDDEN", "Cross-origin mutation denied.");
  }
}
export function parseEntityId(value: string) { return parseInput(entityIdSchema, value); }

export function requiredIdempotencyKey(headers: Headers): string {
  const key = headers.get("idempotency-key") ?? "";
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) {
    throw new ApiError(422, "VALIDATION_ERROR", "Idempotency-Key header required (8–128 letters, numbers, _ or -).");
  }
  return key;
}
