import { NextResponse, type NextRequest } from "next/server";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { parseEntityId } from "@/server/construction/request";
import { errorResponse } from "@/server/api/response";
import { getExpenseDocumentUrl } from "@/server/expense-documents/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{documentId:string}>}) {
  const requestId=crypto.randomUUID();
  try {
    const actor=await requireAuthorizationContext(request.headers);
    const url=await getExpenseDocumentUrl(actor,parseEntityId((await params).documentId));
    return NextResponse.redirect(url,{status:302,headers:{"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
  } catch(error) {return errorResponse(error,requestId);}
}
