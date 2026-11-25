import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(process.cwd(), 'tests/rbac/rbac.integration.test.ts');
const marker = 'STEP 6D.2 — CONCURRENT RBAC INTEGRATION TESTS';
if (!existsSync(target)) throw new Error('Missing tests/rbac/rbac.integration.test.ts. Run from BuildTrack project root.');
const source = readFileSync(target, 'utf8');
if (source.includes(marker)) {
  console.log('Already installed; no changes made.');
  process.exit(0);
}
if (
  !source.includes('describe.skipIf(!run)(') ||
  !source.includes('rejects owner self-grants') ||
  !source.includes('rejects repeated revocation') ||
  !source.includes('const requestId = () =>') ||
  !source.includes('fixture.subjectA') ||
  !source.includes('await prisma.$disconnect()')
) throw new Error('Unexpected Step 6D test content. Refusing to modify the file.');
const currentCount = (source.match(/\bit\(\s*["'`]/g) ?? []).length;
if (currentCount !== 14) throw new Error(`Expected 14 existing tests, found ${currentCount}. No changes made.`);
const closing = /\r?\n\}\);\s*$/.exec(source);
if (!closing) throw new Error('Test file has no recognizable final describe closure. Refusing to patch.');

const additions = String.raw`

  // STEP 6D.2 — CONCURRENT RBAC INTEGRATION TESTS
  // Appended after the original 14 tests so their shared fixtures/assumptions stay intact.
  // These checks use the isolated buildtrack_auth_test guard already defined above.
  let concurrentGrantEvidence: {
    assignmentId: string;
    winningRequestId: string;
    rejectedRequestId: string;
  } | null = null;
  let concurrentRevokeEvidence: {
    assignmentId: string;
    grantRequestId: string;
    winningRequestId: string;
    rejectedRequestId: string;
  } | null = null;

  it("accepts exactly one of two simultaneous ADMIN organization grants", async () => {
    const ids = [requestId(), requestId()];
    const results = await Promise.allSettled(ids.map((id) =>
      grantOperationalRole(owner(), fixture.subjectA,
        { role: "ADMIN", scope: "ORGANIZATION" }, id),
    ));
    const successes = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [{ value: result.value, requestId: ids[index]! }] : [],
    );
    const failures = results.flatMap((result, index) =>
      result.status === "rejected" ? [{ reason: result.reason, requestId: ids[index]! }] : [],
    );
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.reason).toMatchObject({ status: 409 });
    const winner = successes[0]!;
    const loser = failures[0]!;
    expect(await prisma.operationalRoleAssignment.count({ where: {
      organizationId: fixture.orgA, membershipId: fixture.subjectA,
      role: "ADMIN", scope: "ORGANIZATION", revokedAt: null,
    } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: {
      resourceId: winner.value.id, requestId: winner.requestId,
      action: "rbac.role.granted",
    } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { requestId: loser.requestId } })).toBe(0);
    concurrentGrantEvidence = {
      assignmentId: winner.value.id,
      winningRequestId: winner.requestId,
      rejectedRequestId: loser.requestId,
    };
  }, 30_000);

  it("accepts exactly one of two simultaneous revocations", async () => {
    const grantRequestId = requestId();
    const grant = await grantOperationalRole(owner(), fixture.subjectA,
      { role: "FINANCE_MANAGER", scope: "ORGANIZATION" }, grantRequestId);
    const ids = [requestId(), requestId()];
    const results = await Promise.allSettled(ids.map((id) =>
      revokeOperationalRole(owner(), grant.id, id),
    ));
    const successes = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [{ value: result.value, requestId: ids[index]! }] : [],
    );
    const failures = results.flatMap((result, index) =>
      result.status === "rejected" ? [{ reason: result.reason, requestId: ids[index]! }] : [],
    );
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(successes[0]!.value.status).toBe("revoked");
    expect(failures[0]!.reason).toMatchObject({ status: 409 });
    const row = await prisma.operationalRoleAssignment.findUnique({ where: { id: grant.id } });
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(await prisma.auditEvent.count({ where: {
      requestId: successes[0]!.requestId, resourceId: grant.id,
      action: "rbac.role.revoked",
    } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { requestId: failures[0]!.requestId } })).toBe(0);
    concurrentRevokeEvidence = {
      assignmentId: grant.id,
      grantRequestId,
      winningRequestId: successes[0]!.requestId,
      rejectedRequestId: failures[0]!.requestId,
    };
  }, 30_000);

  it("preserves one audit event per successful concurrent change and none for rejected changes", async () => {
    expect(concurrentGrantEvidence).not.toBeNull();
    expect(concurrentRevokeEvidence).not.toBeNull();
    if (!concurrentGrantEvidence || !concurrentRevokeEvidence) {
      throw new Error("Concurrency setup checks did not succeed; audit verification cannot run.");
    }
    const grantAudits = await prisma.auditEvent.findMany({ where: {
      resourceId: concurrentGrantEvidence.assignmentId,
      action: "rbac.role.granted",
    }, select: { requestId: true } });
    expect(grantAudits.map((a) => a.requestId)).toEqual([concurrentGrantEvidence.winningRequestId]);

    const revokeAudits = await prisma.auditEvent.findMany({ where: {
      resourceId: concurrentRevokeEvidence.assignmentId,
      action: { in: ["rbac.role.granted", "rbac.role.revoked"] },
    }, select: { action: true, requestId: true } });
    expect(revokeAudits).toHaveLength(2);
    expect(revokeAudits).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "rbac.role.granted", requestId: concurrentRevokeEvidence.grantRequestId }),
      expect.objectContaining({ action: "rbac.role.revoked", requestId: concurrentRevokeEvidence.winningRequestId }),
    ]));
    expect(await prisma.auditEvent.count({ where: { requestId: { in: [
      concurrentGrantEvidence.rejectedRequestId,
      concurrentRevokeEvidence.rejectedRequestId,
    ] } } })).toBe(0);
  }, 30_000);
`;

const patched = source.slice(0, closing.index) + additions + source.slice(closing.index);
const backup = target + '.before-concurrency.bak';
if (existsSync(backup)) throw new Error('Backup already exists. Refusing to overwrite: ' + backup);
copyFileSync(target, backup);
writeFileSync(target, patched, 'utf8');
console.log('RBAC CONCURRENCY PATCH: APPLIED');
console.log('Original tests: 14; added: 3; expected total: 17');
console.log('Backup:', backup);
