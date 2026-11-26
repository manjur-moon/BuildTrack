import { randomUUID } from "node:crypto";
import { afterAll,describe,expect,it } from "vitest";
import { config } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";
const enabled=process.env.RUN_CONTRACTOR_INTEGRATION==="1";
if(enabled){const u=new URL(process.env.DATABASE_URL??"");if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5433"||u.pathname!=="/buildtrack_auth_test")throw new Error("Unsafe test database");if(config({path:".env",override:false}).error)throw new Error("Missing .env");}
let db:typeof import("@/server/db/client")["prisma"]|undefined;
afterAll(async()=>{if(db)await db.$disconnect();});
describe.skipIf(!enabled)("Contractor lifecycle on isolated PostgreSQL",()=>{
  it("links verified members, grants scoped access, revokes on suspension, rejects unauthorized access and replays",async()=>{
    const {prisma}=await import("@/server/db/client");db=prisma;
    const {mutateContractor,listContractors}=await import("@/server/contractors/service");
    const {deriveOperationalGrants}=await import("@/server/rbac/role-grants");
    const suffix=randomUUID();
    const org=await prisma.organization.create({data:{name:"Contractor test",slug:`contract-${suffix}`}});
    const other=await prisma.organization.create({data:{name:"Other contractor test",slug:`foreign-${suffix}`}});
    async function member(organizationId:string,name:string,role:string){const user=await prisma.user.create({data:{name,email:`${name}-${suffix}@example.test`,emailVerified:true}});return prisma.member.create({data:{organizationId,userId:user.id,role}});}
    const owner=await member(org.id,"owner","owner"), worker=await member(org.id,"worker","member"), foreign=await member(other.id,"foreign","owner");
    const actor=(organizationId:string,membershipId:string,betterAuthRole:string):AuthorizationContext=>({organizationId,membershipId,betterAuthRole,membershipActive:true,emailVerified:true,grants:[]});
    const admin=actor(org.id,owner.id,"owner");
    const project=await prisma.project.create({data:{organizationId:org.id,name:"Contractor project",code:`C-${suffix.slice(0,8)}`,location:"Dhaka",startDate:new Date("2027-01-01"),expectedEndDate:new Date("2027-12-31")}});
    const key=randomUUID();const create={action:"create",name:"Build company"} as const;
    const c=await mutateContractor(admin,create,key,randomUUID());expect(await mutateContractor(admin,create,key,randomUUID())).toEqual(c);
    await expect(mutateContractor(actor(org.id,worker.id,"member"),create,key,randomUUID())).rejects.toMatchObject({status:404});
    await expect(mutateContractor(actor(other.id,foreign.id,"owner"),{action:"status",contractorId:c.id,status:"ACTIVE"},randomUUID(),randomUUID())).rejects.toMatchObject({status:404});
    await mutateContractor(admin,{action:"link",contractorId:c.id,membershipId:worker.id},randomUUID(),randomUUID());
    await mutateContractor(admin,{action:"assign",contractorId:c.id,projectId:project.id},randomUUID(),randomUUID());
    await mutateContractor(admin,{action:"grant",contractorId:c.id,projectId:project.id,membershipId:worker.id},randomUUID(),randomUUID());
    const rows=await prisma.operationalRoleAssignment.findMany({where:{organizationId:org.id,membershipId:worker.id}});
    expect(deriveOperationalGrants(org.id,rows,{activeProjectIds:new Set([project.id]),activeSiteKeys:new Set(),activeContractorProjectIds:new Set([project.id])})).toHaveLength(1);
    const detail=await listContractors(admin,{q:"",page:"1",contractorId:c.id});expect(detail.detail?.users).toHaveLength(1);
    await mutateContractor(admin,{action:"status",contractorId:c.id,status:"SUSPENDED"},randomUUID(),randomUUID());
    expect(await prisma.operationalRoleAssignment.count({where:{organizationId:org.id,membershipId:worker.id,revokedAt:null}})).toBe(0);
    await expect(mutateContractor(admin,{action:"grant",contractorId:c.id,projectId:project.id,membershipId:worker.id},randomUUID(),randomUUID())).rejects.toMatchObject({status:409});
  },60000);
});
