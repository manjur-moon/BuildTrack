import type { NextRequest } from "next/server";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, requiredIdempotencyKey } from "@/server/construction/request";
import { parseJson } from "@/server/api/validation";
import { ok, errorResponse } from "@/server/api/response";
import { documentInput } from "@/server/expense-documents/input";
import { mutateExpenseDocument } from "@/server/expense-documents/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest) {
  const requestId=crypto.randomUUID();
  try {
    const actor=await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    const key=requiredIdempotencyKey(request.headers);
    const input=await parseJson(request,documentInput);
    return ok(await mutateExpenseDocument(actor,input,key,requestId),{requestId});
  } catch(error) { return errorResponse(error,requestId); }
}
