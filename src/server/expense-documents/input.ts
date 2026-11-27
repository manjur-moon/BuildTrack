import { z } from "zod";
import { ACCEPTED_MIME, MAX_IMAGE_BYTES } from "@/server/media/input";

export const DOCUMENT_MIME = [...ACCEPTED_MIME, "application/pdf"] as const;
export const MAX_DOCUMENT_BYTES = MAX_IMAGE_BYTES;
export const MAX_DOCUMENTS = 10;
const id = z.string().min(1).max(128);
const version = z.iso.datetime({ offset: true });
const scope = { projectId: id, expenseId: id };
export const documentInput = z.discriminatedUnion("action", [
  z.strictObject({ ...scope, action: z.literal("init"), expectedUpdatedAt: version,
    fileName: z.string().min(1).max(180).transform(v => v.replace(/[\\/\x00-\x1f\x7f]/g, "_").trim()).pipe(z.string().min(1)),
    mimeType: z.enum(DOCUMENT_MIME), byteSize: z.number().int().min(1).max(MAX_DOCUMENT_BYTES) }),
  z.strictObject({ ...scope, action: z.literal("complete"), documentId: id }),
  z.strictObject({ ...scope, action: z.literal("remove"), documentId: id, expectedUpdatedAt: version }),
]);
export type DocumentInput = z.output<typeof documentInput>;
export type DocumentMime = typeof DOCUMENT_MIME[number];
// A format sanity check only, NOT a PDF parser or malware scanner.
export function looksLikePdf(bytes: Uint8Array) {
  const start = Buffer.from(bytes.subarray(0, 9)).toString("latin1");
  const end = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString("latin1");
  return /^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(start) && /%%EOF[\x09\x0a\x0c\x0d\x20]*$/.test(end);
}
