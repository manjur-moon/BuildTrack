import { describe,expect,it } from "vitest";
import { documentInput,looksLikePdf,MAX_DOCUMENT_BYTES } from "@/server/expense-documents/input";
const sample={action:"init",projectId:"p",expenseId:"e",expectedUpdatedAt:"2026-11-27T00:00:00.000Z",fileName:"receipt.pdf",mimeType:"application/pdf",byteSize:100};
describe("expense document input",()=>{
  it("accepts PDF and supported image MIME types",()=>{
    for(const mimeType of ["application/pdf","image/jpeg","image/png","image/webp"])expect(documentInput.safeParse({...sample,mimeType}).success).toBe(true);
  });
  it("rejects extra tenant or object key fields and unsupported MIME",()=>{
    for(const fields of [{organizationId:"foreign"},{objectKey:"evil"},{mimeType:"text/html"}])expect(documentInput.safeParse({...sample,...fields}).success).toBe(false);
  });
  it("requires version and enforces size and filename limits",()=>{
    for(const fields of [{expectedUpdatedAt:undefined},{byteSize:0},{byteSize:MAX_DOCUMENT_BYTES+1},{fileName:" "}])expect(documentInput.safeParse({...sample,...fields}).success).toBe(false);
  });
  it("checks PDF header and trailer, without claiming full PDF validation",()=>{
    expect(looksLikePdf(Buffer.from("%PDF-1.7\nbody\n%%EOF\n"))).toBe(true);
    expect(looksLikePdf(Buffer.from("<html>%%EOF"))).toBe(false);
    expect(looksLikePdf(Buffer.from("%PDF-1.7\ntruncated"))).toBe(false);
  });
});
