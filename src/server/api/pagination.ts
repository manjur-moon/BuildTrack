import { z } from "zod";
import { parseInput } from "./validation";

export const paginationSchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function parsePagination(searchParams: URLSearchParams) {
  const page = searchParams.get("page") ?? "1";
  const limit = searchParams.get("limit") ?? "20";
  const result = parseInput(paginationSchema, { page, limit });
  return { ...result, skip: (result.page - 1) * result.limit, take: result.limit };
}
