import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand,
  PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { looksLikePdf, type DocumentMime } from "@/server/expense-documents/input";
import { ApiError } from "@/server/api/errors";
import { imageSignatureMatches, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, type AcceptedMime } from "./input";

let cached: { client: S3Client; bucket: string } | undefined;

function storage() {
  if (cached) return cached;
  const env = process.env;
  const required = ["MEDIA_S3_REGION", "MEDIA_S3_BUCKET", "MEDIA_S3_ACCESS_KEY_ID", "MEDIA_S3_SECRET_ACCESS_KEY"] as const;
  for (const field of required) if (!env[field]) throw new Error(`Media object storage setting missing: ${field}`);
  const endpoint = env.MEDIA_S3_ENDPOINT;
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new Error("Media storage endpoint must use HTTPS outside local development.");
    }
  }
  cached = {
    bucket: env.MEDIA_S3_BUCKET!,
    client: new S3Client({
      region: env.MEDIA_S3_REGION!,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: env.MEDIA_S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: env.MEDIA_S3_ACCESS_KEY_ID!, secretAccessKey: env.MEDIA_S3_SECRET_ACCESS_KEY! },
    }),
  };
  return cached;
}

export function temporaryKey(organizationId: string, mediaId: string) {
  return `quarantine/${organizationId}/${mediaId}/${crypto.randomUUID()}`;
}
export function readyKey(organizationId: string, mediaId: string) {
  return `media/${organizationId}/${mediaId}.webp`;
}
export async function presignStagingUpload(key: string, mimeType: DocumentMime) {
  const { client, bucket } = storage();
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket, Key: key, ContentType: mimeType,
  }), { expiresIn: 120 });
  return { uploadUrl, uploadHeaders: { "Content-Type": mimeType }, expiresInSeconds: 120 };
}

async function readBoundedBody(body: AsyncIterable<Uint8Array>): Promise<Buffer> {
  // The caller verifies HEAD first. Re-enforce the cap during streaming because
  // a still-valid PUT URL could overwrite the staging object between HEAD and GET.
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > MAX_IMAGE_BYTES) throw new ApiError(422, "VALIDATION_ERROR", "Image exceeds the allowed size.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

export async function sanitizeAndPublish(stagingKey: string, finalKey: string, mimeType: AcceptedMime, declaredSize: number) {
  const { client, bucket } = storage();
  let head;
  try { head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: stagingKey })); }
  catch (error) {
    if (error && typeof error === "object" && "name" in error && ["NotFound", "NoSuchKey"].includes(String(error.name))) {
      throw new ApiError(409, "CONFLICT", "Upload has not arrived in private storage. Retry the PUT before completing.");
    }
    throw error;
  }
  if (!head.ContentLength || head.ContentLength !== declaredSize || head.ContentLength > MAX_IMAGE_BYTES ||
      head.ContentType?.split(";")[0].trim().toLowerCase() !== mimeType) {
    throw new ApiError(422, "VALIDATION_ERROR", "Uploaded file size or content type differs from the declared image.");
  }
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: stagingKey }));
  if (!response.Body) throw new ApiError(422, "VALIDATION_ERROR", "Uploaded image is empty.");
  const input = await readBoundedBody(response.Body as AsyncIterable<Uint8Array>);
  if (input.length !== declaredSize || !imageSignatureMatches(mimeType, input)) {
    throw new ApiError(422, "VALIDATION_ERROR", "Image signature or size did not match.");
  }
  let normalized: Buffer;
  try {
    const instance = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error", animated: false });
    const metadata = await instance.metadata();
    const expected = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[mimeType];
    if (metadata.format !== expected || !metadata.width || !metadata.height ||
        metadata.pages && metadata.pages > 1) {
      throw new Error("Unexpected image format or pages");
    }
    // rotate() applies EXIF orientation; re-encoding without withMetadata strips EXIF/GPS.
    normalized = await instance.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 }).toBuffer();
  } catch {
    throw new ApiError(422, "VALIDATION_ERROR", "Image could not be safely decoded and normalized.");
  }
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: finalKey, Body: normalized, ContentType: "image/webp",
    CacheControl: "private, max-age=0, no-store",
  }));
  return { bytes: normalized.length };
}

export async function deleteStoredObject(key: string): Promise<void> {
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
export async function signedPrivateView(key: string): Promise<string> {
  const { client, bucket } = storage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key,
    ResponseContentDisposition: "inline", ResponseContentType: "image/webp",
  }), { expiresIn: 60 });
}

/** Publish PDF as a private download; format checks are not malware scanning. */
export async function publishExpenseDocument(stagingKey: string, finalKey: string, mimeType: DocumentMime, declaredSize: number) {
  if (mimeType !== "application/pdf") {
    const output = await sanitizeAndPublish(stagingKey, finalKey, mimeType, declaredSize);
    return { ...output, mimeType: "image/webp" };
  }
  const { client, bucket } = storage();
  let head;
  try { head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: stagingKey })); }
  catch (error) {
    if (error && typeof error === "object" && "name" in error && ["NotFound", "NoSuchKey"].includes(String(error.name))) {
      throw new ApiError(409, "CONFLICT", "Document upload not found. Remove the pending document and retry.");
    }
    throw error;
  }
  if (head.ContentLength !== declaredSize || declaredSize > MAX_IMAGE_BYTES ||
      head.ContentType?.split(";")[0].trim().toLowerCase() !== mimeType) {
    throw new ApiError(422, "VALIDATION_ERROR", "Uploaded document differs from the declared size or format.");
  }
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: stagingKey }));
  if (!response.Body) throw new ApiError(422, "VALIDATION_ERROR", "Uploaded document is empty.");
  const input = await readBoundedBody(response.Body as AsyncIterable<Uint8Array>);
  if (input.length !== declaredSize || !looksLikePdf(input)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid PDF signature or size.");
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: finalKey, Body: input, ContentType: mimeType,
    ContentDisposition: 'attachment; filename="expense-document.pdf"', CacheControl: "private, max-age=0, no-store" }));
  return { bytes: input.length, mimeType };
}
export async function signedExpenseDownload(key: string, mimeType: string) {
  const { client, bucket } = storage();
  const filename = mimeType === "application/pdf" ? "expense-document.pdf" : "expense-receipt.webp";
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`, ResponseContentType: mimeType,
  }), { expiresIn: 60 });
}
