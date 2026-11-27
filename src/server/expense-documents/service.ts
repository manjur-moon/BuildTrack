import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { assertCurrentWriteAccess } from "@/server/construction/write-access";
import { requireLiveProjectLock } from "@/server/construction/locking";
import { audit, inventoryWrite, type Tx } from "@/server/inventory/transaction";
import { deleteStoredObject, presignStagingUpload, publishExpenseDocument, signedExpenseDownload, temporaryKey } from "@/server/media/storage";
import { DOCUMENT_MIME, MAX_DOCUMENTS, type DocumentInput, type DocumentMime } from "./input";

function missing(): never { throw new ApiError(404, "NOT_FOUND", "Expense document not found."); }
function conflict(message: string): never { throw new ApiError(409, "CONFLICT", message); }
const select = { id:true, originalName:true, mimeType:true, byteSize:true, status:true, createdAt:true,
  uploadedByMembershipId:true, objectKey:true } as const;
const whereFor = (actor: AuthorizationContext, expenseId: string) => ({ organizationId:actor.organizationId, expenseId, deletedAt:null });
async function access(tx: Tx, actor: AuthorizationContext, projectId: string, expenseId: string, write: boolean) {
  await requireLiveProjectLock(tx,actor.organizationId,projectId);
  await assertCurrentWriteAccess(tx,actor,write?"expense:create":"expense:view",{organizationId:actor.organizationId,projectId});
  const expense = await tx.expense.findFirst({where:{id:expenseId,organizationId:actor.organizationId,projectId}});
  if (!expense || (write && expense.recordedByMembershipId !== actor.membershipId)) missing();
  if (write && expense.status !== "DRAFT") conflict("Posted and voided expense evidence is immutable.");
  return expense;
}
function verifyVersion(actual: Date, expected: string) {
  if (actual.getTime() !== new Date(expected).getTime()) conflict("Expense changed. Refresh the ledger and retry.");
}
async function bump(tx: Tx, expense: {id:string;updatedAt:Date}) {
  await tx.expense.update({where:{id:expense.id},data:{updatedAt:new Date(Math.max(Date.now(),expense.updatedAt.getTime()+1))}});
}
async function cleanup(key: string, id: string) {
  try { await deleteStoredObject(key); } catch { console.warn(JSON.stringify({event:"expense_document_cleanup_failed",documentId:id})); }
}
export async function mutateExpenseDocument(actor: AuthorizationContext, input: DocumentInput, key: string, requestId: string) {
  const {projectId,expenseId}=input;
  const where=whereFor(actor,expenseId);
  const guard=async(tx:Tx)=>{ await access(tx,actor,projectId,expenseId,true); };
  if(input.action === "init") {
    const record=await inventoryWrite(actor,"expense-document.init",key,input,guard,async tx=>{
      const expense=await access(tx,actor,projectId,expenseId,true);
      verifyVersion(expense.updatedAt,input.expectedUpdatedAt);
      if(await tx.fileAttachment.count({where})>=MAX_DOCUMENTS) conflict("Maximum 10 active documents per expense.");
      const recent=await tx.fileAttachment.count({where:{organizationId:actor.organizationId,uploadedByMembershipId:actor.membershipId,createdAt:{gte:new Date(Date.now()-3600000)}}});
      if(recent>=30) throw new ApiError(429,"RATE_LIMITED","Hourly upload limit reached.");
      const id=crypto.randomUUID();
      await tx.fileAttachment.create({data:{id,organizationId:actor.organizationId,expenseId,uploadedByMembershipId:actor.membershipId,
        originalName:input.fileName,mimeType:input.mimeType,byteSize:BigInt(input.byteSize),objectKey:temporaryKey(actor.organizationId,id),status:"PENDING"}});
      await bump(tx,expense);
      await audit(tx,actor,requestId,"EXPENSE_DOCUMENT_INITIATED","FILE_ATTACHMENT",id,{expenseId,projectId,mimeType:input.mimeType,bytes:input.byteSize});
      return {id};
    });
    const pending=await prisma.$transaction(async tx=>{
      await guard(tx);
      const row=await tx.fileAttachment.findFirst({where:{...where,id:record.id,uploadedByMembershipId:actor.membershipId,status:"PENDING"},select});
      if(!row || Date.now()-row.createdAt.getTime()>15*60000) conflict("Upload session expired or already completed. Refresh the ledger.");
      return row;
    });
    return {id:record.id,...await presignStagingUpload(pending.objectKey,input.mimeType)};
  }
  if(input.action === "remove") {
    const result=await inventoryWrite(actor,"expense-document.remove",key,input,guard,async tx=>{
      const expense=await access(tx,actor,projectId,expenseId,true);
      verifyVersion(expense.updatedAt,input.expectedUpdatedAt);
      const row=await tx.fileAttachment.findFirst({where:{...where,id:input.documentId,uploadedByMembershipId:actor.membershipId},select});
      if(!row) missing();
      await tx.fileAttachment.update({where:{id:row.id},data:{status:"DELETED",deletedAt:new Date()}});
      await bump(tx,expense);
      await audit(tx,actor,requestId,"EXPENSE_DOCUMENT_REMOVED","FILE_ATTACHMENT",row.id,{expenseId,projectId,status:"DELETED"},{status:row.status});
      return {id:row.id};
    });
    // Read the committed tombstone, never delete storage on an uncertain transaction result.
    const removed=await prisma.fileAttachment.findFirst({where:{organizationId:actor.organizationId,expenseId,id:result.id,status:"DELETED",uploadedByMembershipId:actor.membershipId},select:{objectKey:true}});
    if(removed) await cleanup(removed.objectKey,result.id);
    return result;
  }
  const pending=await prisma.$transaction(async tx=>{
    await guard(tx);
    const row=await tx.fileAttachment.findFirst({where:{...where,id:input.documentId,uploadedByMembershipId:actor.membershipId},select});
    if(!row) missing();
    if(row.status === "READY") return row;
    if(row.status!=="PENDING"||Date.now()-row.createdAt.getTime()>15*60000) conflict("Upload expired. Remove it and start again.");
    return row;
  });
  if(pending.status==="READY") return {id:pending.id};
  if(!DOCUMENT_MIME.includes(pending.mimeType as DocumentMime)) conflict("Unsupported stored document type.");
  // Each attempt writes to a unique final key. Concurrent completions cannot overwrite approved evidence.
  const finalKey=`expense-documents/${actor.organizationId}/${pending.id}/${crypto.randomUUID()}.${pending.mimeType==="application/pdf"?"pdf":"webp"}`;
  const output=await publishExpenseDocument(pending.objectKey,finalKey,pending.mimeType as DocumentMime,Number(pending.byteSize));
  const result=await prisma.$transaction(async tx=>{
    const expense=await access(tx,actor,projectId,expenseId,true);
    const updated=await tx.fileAttachment.updateMany({where:{...where,id:pending.id,status:"PENDING",objectKey:pending.objectKey,uploadedByMembershipId:actor.membershipId},data:{status:"READY",objectKey:finalKey,mimeType:output.mimeType,byteSize:BigInt(output.bytes)}});
    if(updated.count!==1) conflict("Document changed. Refresh the ledger.");
    await bump(tx,expense);
    await audit(tx,actor,requestId,"EXPENSE_DOCUMENT_COMPLETED","FILE_ATTACHMENT",pending.id,{expenseId,projectId,bytes:output.bytes,mimeType:output.mimeType});
    return {id:pending.id};
  });
  await cleanup(pending.objectKey,pending.id);
  return result;
}
export async function getExpenseDocumentUrl(actor: AuthorizationContext, id: string) {
  const row=await prisma.$transaction(async tx=>{
    const document=await tx.fileAttachment.findFirst({where:{id,organizationId:actor.organizationId,expenseId:{not:null},status:"READY",deletedAt:null},select:{objectKey:true,mimeType:true,expense:{select:{id:true,projectId:true}}}});
    if(!document?.expense) missing();
    await access(tx,actor,document.expense.projectId,document.expense.id,false);
    return document;
  });
  return signedExpenseDownload(row.objectKey,row.mimeType);
}
