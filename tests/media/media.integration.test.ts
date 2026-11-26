import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { config as dotenv } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";

/**
 * OPT-IN: isolated local PostgreSQL + local MinIO only.
 * Fixture rows, audit events and access logs remain: DO NOT reset databases.
 * Never run this suite on a staging or production S3/R2 bucket.
 */
const enabled = process.env.RUN_MEDIA_INTEGRATION === "1";
if (enabled) {
  dotenv({ path: ".env", override: false });
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Set DATABASE_URL explicitly to the local buildtrack_auth_test database.");
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/buildtrack_auth_test") {
    throw new Error("Media integration tests refuse non-local or non-test databases.");
  }
  const endpoint = new URL(process.env.MEDIA_S3_ENDPOINT ?? "http://invalid");
  if (!["127.0.0.1", "localhost"].includes(endpoint.hostname) ||
      !process.env.MEDIA_S3_BUCKET?.startsWith("buildtrack-test-")) {
    throw new Error("Media integration tests require local MinIO endpoint and a buildtrack-test-* bucket.");
  }
}

type Db = (typeof import("@/server/db/client"))["prisma"];
type Media = typeof import("@/server/media/service");

describe.skipIf(!enabled)("Step 10 — isolated PostgreSQL and local MinIO integration", () => {
  let db: Db;
  let media: Media;
  let projectId: string;
  let siteId: string;
  let orgId: string;
  let ownerId: string;
  let foreignOrgId: string;
  let foreignOwnerId: string;
  let photoId: string;
  let jpeg: Buffer;

  const owner = (): AuthorizationContext => ({ organizationId: orgId, membershipId: ownerId,
    membershipActive: true, emailVerified: true, betterAuthRole: "owner", grants: [] });
  const foreign = (): AuthorizationContext => ({ ...owner(), organizationId: foreignOrgId, membershipId: foreignOwnerId });

  beforeAll(async () => {
    ({ prisma: db } = await import("@/server/db/client"));
    media = await import("@/server/media/service");
    const { default: sharp } = await import("sharp");
    jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 12, g: 40, b: 24 } } })
      .jpeg().toBuffer();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
    const fixture = await db.$transaction(async (tx) => {
      const a = await tx.organization.create({ data: { name: `Step10 A ${suffix}`, slug: `step10-a-${suffix}` } });
      const b = await tx.organization.create({ data: { name: `Step10 B ${suffix}`, slug: `step10-b-${suffix}` } });
      const makeOwner = async (organizationId: string, label: string) => {
        const u = await tx.user.create({ data: { name: label, email: `step10-${label}-${suffix}@example.test`, emailVerified: true } });
        return tx.member.create({ data: { organizationId, userId: u.id, role: "owner" } });
      };
      const memberA = await makeOwner(a.id, "owner-a");
      const memberB = await makeOwner(b.id, "owner-b");
      const project = await tx.project.create({ data: {
        organizationId: a.id, name: "Media integration project", code: `M10-${suffix.slice(0, 12)}`, location: "Dhaka",
        startDate: new Date("2026-11-01T00:00:00.000Z"), expectedEndDate: new Date("2027-04-30T00:00:00.000Z"),
      } });
      const site = await tx.constructionSite.create({ data: { organizationId: a.id, projectId: project.id,
        name: "Integration site", location: "Dhaka" } });
      return { orgId: a.id, foreignOrgId: b.id, ownerId: memberA.id, foreignOwnerId: memberB.id,
        projectId: project.id, siteId: site.id };
    });
    ({ orgId, foreignOrgId, ownerId, foreignOwnerId, projectId, siteId } = fixture);
  }, 60_000);

  afterAll(async () => { if (db) await db.$disconnect(); }, 30_000);

  it("uploads, verifies, sanitizes, lists and reads site evidence while keeping the project gallery isolated", async () => {
    const initiated = await media.initiateMediaUpload(owner(), {
      kind: "SITE", resourceId: siteId, fileName: "evidence.jpg", mimeType: "image/jpeg", byteSize: jpeg.length,
    }, randomUUID());
    photoId = initiated.id;
    const uploaded = await fetch(initiated.uploadUrl, { method: "PUT", headers: initiated.uploadHeaders,
      body: new Uint8Array(jpeg), credentials: "omit" });
    expect(uploaded.status).toBeGreaterThanOrEqual(200);
    expect(uploaded.status).toBeLessThan(300);
    const ready = await media.completeMediaUpload(owner(), photoId, randomUUID());
    expect(ready.mimeType).toBe("image/webp");
    expect(ready.contentUrl).not.toContain("s3");
    const siteMedia = await media.listMedia(owner(), { kind: "SITE", resourceId: siteId, page: 1, limit: 24 });
    expect(siteMedia.items.some((p) => p.id === photoId)).toBe(true);
    const projectMedia = await media.listMedia(owner(), { kind: "PROJECT", resourceId: projectId, page: 1, limit: 24 });
    expect(projectMedia.items.some((p) => p.id === photoId)).toBe(false);
    const url = await media.getPrivateMediaUrl(owner(), photoId);
    expect(url).toMatch(/^http:\/\//);
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("image/webp");
  }, 35_000);

  it("does not disclose or delete the photo through a foreign organization", async () => {
    await expect(media.getPrivateMediaUrl(foreign(), photoId)).rejects.toMatchObject({ status: 404 });
    await expect(media.deleteMedia(foreign(), photoId, randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it("soft-deletes the photo and preserves its audit trail", async () => {
    await media.deleteMedia(owner(), photoId, randomUUID());
    await expect(media.getPrivateMediaUrl(owner(), photoId)).rejects.toMatchObject({ status: 404 });
    const row = await db.fileAttachment.findUniqueOrThrow({ where: { id: photoId } });
    expect(row.status).toBe("DELETED");
    expect(row.deletedAt).not.toBeNull();
    expect(await db.auditEvent.count({ where: { organizationId: orgId,
      resourceType: "FILE_ATTACHMENT", resourceId: photoId } })).toBeGreaterThanOrEqual(3);
  }, 30_000);
});
