import "dotenv/config";
/** One-time bootstrap for a fresh DISPOSABLE DEVELOPMENT database only.
 * Never run against a production database. This script is intentionally non-idempotent.
 */
import { prisma } from "../src/server/db/client";
import { auth } from "../src/server/auth/auth";
import { getAuthEnv } from "../src/server/auth/auth-env";
import { createInternalSignupProof, INTERNAL_PROOF_HEADER } from "../src/server/auth/internal-proof";

async function main(){
 if(process.env.NODE_ENV === "production" || process.env.BUILDTRACK_BOOTSTRAP_ENABLED !== "yes") throw new Error("Bootstrap is disabled (dev only)");
 const name=process.env.BOOTSTRAP_NAME;const email=process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase();
 const password=process.env.BOOTSTRAP_PASSWORD;const organizationName=process.env.BOOTSTRAP_ORG_NAME ?? "BuildTrack Demo Construction";
 const slug=process.env.BOOTSTRAP_ORG_SLUG ?? "buildtrack-demo";
 if(!name||!email||!password||password.length<12)throw new Error("Set BOOTSTRAP_NAME, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD (12+ chars)");
 if(await prisma.organization.count()!==0 || await prisma.user.count()!==0)throw new Error("Bootstrap requires an empty development DB");
 const proof=createInternalSignupProof(email,"development-bootstrap",getAuthEnv().BETTER_AUTH_SECRET);
 const response=await auth.api.signUpEmail({body:{name,email,password},headers:new Headers({[INTERNAL_PROOF_HEADER]:proof})});
 if(!response.user?.id)throw new Error("Better Auth signup failed");
 // Trusted local operator verified ownership through the development setup.
 await prisma.$transaction(async tx=>{
  await tx.user.update({where:{id:response.user.id},data:{emailVerified:true}});
  const org=await tx.organization.create({data:{name:organizationName,slug}});
  await tx.member.create({data:{organizationId:org.id,userId:response.user.id,role:"owner"}});
  await tx.organizationSettings.create({data:{organizationId:org.id}});
 });
 console.log("Created development owner + organization. Disable BUILDTRACK_BOOTSTRAP_ENABLED now. Do not reuse this database for production.");
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Bootstrap failed");process.exitCode=1}).finally(()=>prisma.$disconnect());
