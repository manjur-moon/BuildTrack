import { describe, expect, it } from "vitest";
import { initMediaSchema, imageSignatureMatches, mediaPublicDTO, parseListMediaQuery } from "@/server/media/input";

describe("Step 10: media validation and safe DTO", () => {
  const valid = { kind: "PROJECT", resourceId: "project_1", fileName: "Photo.jpg", mimeType: "image/jpeg", byteSize: 1024 };
  it("accepts a valid image upload initiation", () => {
    expect(initMediaSchema.parse(valid).fileName).toBe("Photo.jpg");
  });
  it("rejects SVG and scripts even when the extension looks harmless", () => {
    expect(initMediaSchema.safeParse({ ...valid, mimeType: "image/svg+xml" }).success).toBe(false);
    expect(initMediaSchema.safeParse({ ...valid, mimeType: "text/html" }).success).toBe(false);
  });
  it("rejects empty and oversized originals", () => {
    expect(initMediaSchema.safeParse({ ...valid, byteSize: 0 }).success).toBe(false);
    expect(initMediaSchema.safeParse({ ...valid, byteSize: 8 * 1024 * 1024 + 1 }).success).toBe(false);
  });
  it("normalizes filename separators, control bytes and rejects extras", () => {
    expect(initMediaSchema.parse({ ...valid, fileName: "..\\gps/blue\u0000.jpg" }).fileName).not.toMatch(/[\\/\x00]/);
    expect(initMediaSchema.safeParse({ ...valid, bucket: "other" }).success).toBe(false);
  });
  it("checks JPEG, PNG, WebP magic bytes", () => {
    expect(imageSignatureMatches("image/jpeg", new Uint8Array([255, 216, 255]))).toBe(true);
    expect(imageSignatureMatches("image/png", new Uint8Array([137,80,78,71,13,10,26,10]))).toBe(true);
    expect(imageSignatureMatches("image/webp", new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]))).toBe(true);
    expect(imageSignatureMatches("image/jpeg", new Uint8Array([71,73,70,56]))).toBe(false);
  });
  it("requires exactly one kind and resourceId; caps pagination", () => {
    expect(parseListMediaQuery(new URLSearchParams("kind=SITE&resourceId=site1")).limit).toBe(24);
    expect(() => parseListMediaQuery(new URLSearchParams("kind=SITE&resourceId=site1&kind=PROJECT"))).toThrow();
    expect(() => parseListMediaQuery(new URLSearchParams("kind=SITE&resourceId=site1&limit=1000"))).toThrow();
    expect(() => parseListMediaQuery(new URLSearchParams("kind=SITE&resourceId=site1&organizationId=foreign"))).toThrow();
  });
  it("never exposes private storage object keys, S3 endpoints, credentials or uploader IDs", () => {
    const item = mediaPublicDTO({ id: "media1", originalName: "photo.jpg", mimeType: "image/webp", byteSize: 25000n,
      createdAt: new Date("2026-11-26T00:00:00Z"), uploadedByMembershipId: "secret_actor", siteId: null }, false);
    expect(JSON.stringify(item)).not.toContain("secret_actor");
    expect(JSON.stringify(item)).not.toContain("objectKey");
    expect(item.contentUrl).toBe("/api/v1/media/media1/content");
  });
});
