import { z } from "zod";
import { ApiError } from "./errors";

export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Request validation failed.", result.error.issues.map((issue) => ({
      field: issue.path.join("."), message: issue.message,
    })));
  }
  return result.data;
}

export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 64 * 1024) throw new ApiError(413, "VALIDATION_ERROR", "Request body too large.");
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "VALIDATION_ERROR", "Expected application/json.");
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 64 * 1024) throw new ApiError(413, "VALIDATION_ERROR", "Request body too large.");
    body = JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "VALIDATION_ERROR", "Malformed JSON request.");
  }
  return parseInput(schema, body);
}
