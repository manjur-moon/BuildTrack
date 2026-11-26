import { z } from "zod";
import { ApiError } from "@/server/api/errors";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

const entityId = z.string().min(1).max(128);
const safeFileName = z.string().min(1).max(180).transform((raw) => raw.replace(/[\\/\x00-\x1f\x7f]/g, "_").trim()).pipe(z.string().min(1));
export const initMediaSchema = z.strictObject({
  kind: z.enum(["PROJECT", "SITE"]),
  resourceId: entityId,
  fileName: safeFileName,
  mimeType: z.enum(ACCEPTED_MIME),
  byteSize: z.number().int().min(1).max(MAX_IMAGE_BYTES),
});
export const completeMediaSchema = z.strictObject({});
export type InitMedia = z.output<typeof initMediaSchema>;

export const listMediaQuerySchema = z.strictObject({
  kind: z.enum(["PROJECT", "SITE"]),
  resourceId: entityId,
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});
export type ListMediaQuery = z.output<typeof listMediaQuerySchema>;

export function parseListMediaQuery(params: URLSearchParams): ListMediaQuery {
  const allow = new Set(["kind", "resourceId", "page", "limit"]);
  const values: Record<string,string> = {};
  for (const [key, value] of params) {
    if (!allow.has(key) || Object.prototype.hasOwnProperty.call(values, key)) {
      throw new ApiError(422, "VALIDATION_ERROR", "Unknown or repeated media query parameter.");
    }
    values[key] = value;
  }
  const parsed = listMediaQuerySchema.safeParse(values);
  if (!parsed.success) throw new ApiError(422, "VALIDATION_ERROR", "Invalid media list query.");
  return parsed.data;
}

export function imageSignatureMatches(mime: AcceptedMime, input: Uint8Array): boolean {
  if (mime === "image/jpeg") return input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  if (mime === "image/png") return input.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, index) => input[index] === byte);
  return input.length >= 12 && [82,73,70,70].every((byte, index) => input[index] === byte)
    && [87,69,66,80].every((byte, index) => input[index + 8] === byte);
}

export function mediaPublicDTO(row: {
  id: string; originalName: string; mimeType: string; byteSize: bigint; createdAt: Date;
  uploadedByMembershipId: string; siteId: string | null;
}, canDelete: boolean) {
  return {
    id: row.id, name: row.originalName, mimeType: row.mimeType,
    byteSize: Number(row.byteSize), siteId: row.siteId,
    createdAt: row.createdAt.toISOString(), canDelete,
    contentUrl: `/api/v1/media/${encodeURIComponent(row.id)}/content`,
  };
}
