import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { config } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";
vi.mock("@/server/media/storage",()=>({
  temporaryKey:(org:string,id:string)=>`quarantine/${org}/${id}`,
  presignStagingUpload:vi.fn(async()=>({uploadUrl:"https://storage.example.test/upload",uploadHeaders:{"Content-Type":"application/pdf"},expiresInSeconds:120})),
  publishExpenseDocument:vi.fn(async()=>({bytes:100,mimeType:"application/pdf"})),
  signedExpenseDownload:vi.fn(async()=>"https://storage.example.test/download"),
  deleteStoredObject:vi.fn(async()=>undefined),
}));
const enabled=process.env.RUN_EXPENSE_DOCUMENT_INTEGRATION==="1";
if(enabled){
  const u=new URL(process.env.DATABASE_URL??"");
  if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5433"||u.pathname!=="/buildtrack_auth_test")throw Error("Unsafe finance test database");
  if(config({path:".env",override:false}).error)throw Error("Missing .env");
}
describe.skipIf(!enabled)("Step 13E.2B isolated expense documents (mocked storage)",()=>{
  let documents:typeof import("@/server/expense-documents/service");
  let db:typeof import("@/server/db/client")["prisma"];
  let service:typeof import("@/server/finance/service");
  let owner:AuthorizationContext,manager:AuthorizationContext,foreign:AuthorizationContext,projectId:string;
  beforeAll(async()=>{
    ({prisma:db}=await import("@/server/db/client"));service=await import("@/server/finance/service");documents=await import("@/server/expense-documents/service");
    const suffix=randomUUID().slice(0,8);
    await db.$transaction(async tx=>{
      const a=await tx.organization.create({data:{name:"Finance test",slug:`finance-${suffix}`}});
      const b=await tx.organization.create({data:{name:"Other finance test",slug:`finance-other-${suffix}`}});
      async function member(organizationId:string,name:string,role:string){
        const user=await tx.user.create({data:{name,email:`finance-${name}-${suffix}@example.test`,emailVerified:true}});
        return tx.member.create({data:{organizationId,userId:user.id,role}});
      }
      const o=await member(a.id,"owner","owner"),m=await member(a.id,"manager","member"),f=await member(b.id,"foreign","owner");
      const p=await tx.project.create({data:{organizationId:a.id,name:"Finance project",code:`FIN-${suffix}`,location:"Dhaka",startDate:new Date("2026-01-01"),expectedEndDate:new Date("2027-01-01")}});
      projectId=p.id;
      await tx.projectMember.create({data:{organizationId:a.id,projectId,membershipId:m.id}});
      await tx.operationalRoleAssignment.create({data:{organizationId:a.id,projectId,membershipId:m.id,grantedByMembershipId:o.id,role:"PROJECT_MANAGER",scope:"PROJECT"}});
      owner={organizationId:a.id,membershipId:o.id,membershipActive:true,emailVerified:true,betterAuthRole:"owner",grants:[]};
      manager={...owner,membershipId:m.id,betterAuthRole:"member",grants:[{role:"PROJECT_MANAGER",scope:"project",organizationId:a.id,projectId}]};
      foreign={...owner,organizationId:b.id,membershipId:f.id};
    });
  },60000);
  afterAll(async()=>{if(db)await db.$disconnect();});
  it("isolates receipts, blocks stale approval, preserves posted evidence and permits removal of incomplete drafts",async()=>{
    const write=(actor:AuthorizationContext,input:Parameters<typeof service.mutateFinance>[1])=>service.mutateFinance(actor,input,randomUUID(),randomUUID());
    const mutate=(actor:AuthorizationContext,input:Parameters<typeof documents.mutateExpenseDocument>[1],key=randomUUID())=>documents.mutateExpenseDocument(actor,input,key,randomUUID());
    const category=await write(owner,{action:"category",name:"Invoice category"});
    const draft=await write(manager,{action:"draft",projectId,categoryId:category.id,title:"Receipt test",amount:"25.00",date:"2026-11-27"});
    const version=async()=> (await db.expense.findUniqueOrThrow({where:{id:draft.id}})).updatedAt.toISOString();
    const scope={projectId,expenseId:draft.id};
    const first=await version();
    const init={...scope,action:"init" as const,expectedUpdatedAt:first,fileName:"receipt.pdf",mimeType:"application/pdf" as const,byteSize:100};
    await expect(mutate(owner,init)).rejects.toMatchObject({status:404});
    await expect(mutate(foreign,init)).rejects.toMatchObject({status:404});
    const key=randomUUID();const receipt=await mutate(manager,init,key);
    expect((await mutate(manager,init,key)).id).toBe(receipt.id);
    expect(await db.fileAttachment.count({where:{expenseId:draft.id}})).toBe(1);
    await expect(documents.getExpenseDocumentUrl(owner,receipt.id)).rejects.toMatchObject({status:404});
    await expect(write(owner,{action:"post",...scope,expectedUpdatedAt:first})).rejects.toMatchObject({status:409});
    await expect(write(owner,{action:"post",...scope,expectedUpdatedAt:await version()})).rejects.toMatchObject({status:409});
    await mutate(manager,{...scope,action:"complete",documentId:receipt.id});
    await mutate(manager,{...scope,action:"complete",documentId:receipt.id});
    expect(await documents.getExpenseDocumentUrl(owner,receipt.id)).toBe("https://storage.example.test/download");
    await expect(documents.getExpenseDocumentUrl(foreign,receipt.id)).rejects.toMatchObject({status:404});
    const next=await mutate(manager,{...init,expectedUpdatedAt:await version()});
    await mutate(manager,{...scope,action:"remove",documentId:next.id,expectedUpdatedAt:await version()});
    const current=(await service.listFinance(owner,projectId,1)).expenses.find(e=>e.id===draft.id)!;
    expect(current.documents.map(d=>d.id)).toEqual([receipt.id]);
    expect(current.canPost).toBe(true);
    await write(owner,{action:"post",...scope,expectedUpdatedAt:await version()});
    await expect(mutate(manager,{...scope,action:"remove",documentId:receipt.id,expectedUpdatedAt:await version()})).rejects.toMatchObject({status:409});
    await expect(mutate(manager,{...init,expectedUpdatedAt:await version()})).rejects.toMatchObject({status:409});
    expect(await db.auditEvent.count({where:{organizationId:owner.organizationId,resourceId:receipt.id,action:"EXPENSE_DOCUMENT_COMPLETED"}})).toBe(1);
    await write(owner,{action:"void",...scope,expectedUpdatedAt:await version(),reason:"Correct invoice reference"});
    expect(await documents.getExpenseDocumentUrl(owner,receipt.id)).toBe("https://storage.example.test/download");
    await expect(mutate(manager,{...scope,action:"remove",documentId:receipt.id,expectedUpdatedAt:await version()})).rejects.toMatchObject({status:409});
    const revoke=await db.operationalRoleAssignment.findFirstOrThrow({where:{organizationId:owner.organizationId,membershipId:manager.membershipId,projectId}});
    await db.operationalRoleAssignment.update({where:{id:revoke.id},data:{revokedAt:new Date(),revokedByMembershipId:owner.membershipId}});
    await expect(documents.getExpenseDocumentUrl(manager,receipt.id)).rejects.toMatchObject({status:403});
  },60000);
});
