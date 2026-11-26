import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "@/server/rbac/policy";

const mocks = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  constructionSite: { findFirst: vi.fn() },
  fileAttachment: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  signView: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({ prisma: {
  project: mocks.project, constructionSite: mocks.constructionSite, fileAttachment: mocks.fileAttachment,
} }));
vi.mock("@/server/media/storage", () => ({ signedPrivateView: mocks.signView }));

import { getPrivateMediaUrl, listMedia } from "@/server/media/service";
const owner = (): AuthorizationContext => ({ organizationId: "orgA", membershipId: "memberA", membershipActive: true,
  emailVerified: true, betterAuthRole: "owner", grants: [] });
const contractor = (): AuthorizationContext => ({ ...owner(), betterAuthRole: "member", grants: [{ role: "CONTRACTOR",
  scope: "project", organizationId: "orgA", projectId: "project1" }] });
const projectMedia = { id: "media1", organizationId: "orgA", projectId: "project1", siteId: null,
  objectKey: "secret-key", originalName: "photo.jpg", mimeType: "image/webp", byteSize: 1000n,
  status: "READY", createdAt: new Date(), deletedAt: null, uploadedByMembershipId: "memberA" };

describe("Step 10 media authorization boundaries (mocked database, no external storage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.findFirst.mockResolvedValue({ id: "project1" });
    mocks.fileAttachment.findFirst.mockResolvedValue(projectMedia);
    mocks.fileAttachment.findMany.mockResolvedValue([projectMedia]);
    mocks.fileAttachment.count.mockResolvedValue(1);
    mocks.signView.mockResolvedValue("https://private.example.test/signed");
  });
  it("never lists project photos for summary-only contractors", async () => {
    await expect(listMedia(contractor(), { kind: "PROJECT", resourceId: "project1", page: 1, limit: 24 })).rejects.toMatchObject({ status: 404 });
    expect(mocks.fileAttachment.findMany).not.toHaveBeenCalled();
  });
  it("enforces tenant, project and READY predicates in SQL before row selection", async () => {
    const response = await listMedia(owner(), { kind: "PROJECT", resourceId: "project1", page: 1, limit: 24 });
    expect(response.items).toHaveLength(1);
    expect(JSON.stringify(response)).not.toContain("secret-key");
    expect(mocks.fileAttachment.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: "orgA", projectId: "project1", siteId: null, status: "READY", deletedAt: null,
    });
  });
  it("denies cross-tenant viewing even when media ID exists", async () => {
    mocks.fileAttachment.findFirst.mockResolvedValue(null);
    await expect(getPrivateMediaUrl(owner(), "foreignMedia")).rejects.toMatchObject({ status: 404 });
    expect(mocks.signView).not.toHaveBeenCalled();
    expect(mocks.fileAttachment.findFirst.mock.calls[0][0].where.organizationId).toBe("orgA");
  });
  it("does not issue a signed URL for unverified PENDING objects", async () => {
    mocks.fileAttachment.findFirst.mockResolvedValue({ ...projectMedia, status: "PENDING" });
    await expect(getPrivateMediaUrl(owner(), "media1")).rejects.toMatchObject({ status: 404 });
    expect(mocks.signView).not.toHaveBeenCalled();
  });
  it("rechecks live project and permission before signing a private image", async () => {
    const link = await getPrivateMediaUrl(owner(), "media1");
    expect(link).toContain("signed");
    expect(mocks.project.findFirst).toHaveBeenCalled();
    expect(mocks.signView).toHaveBeenCalledWith("secret-key");
  });
});
