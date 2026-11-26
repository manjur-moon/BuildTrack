import type { NextRequest } from "next/server";
import { ok,errorResponse } from "@/server/api/response";
import { parseInput,parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin,requiredIdempotencyKey } from "@/server/construction/request";
import { ApiError } from "@/server/api/errors";
import { milestoneInput,milestoneQuery } from "@/server/milestones/input";
import { listMilestones,mutateMilestone } from "@/server/milestones/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
  const requestId=crypto.randomUUID();
  try {
    const actor=await requireAuthorizationContext(request.headers);
    const params=request.nextUrl.searchParams;
    for(const key of params.keys()) if(params.getAll(key).length!==1) throw new ApiError(422,"VALIDATION_ERROR","Duplicate query parameter.");
    const query=parseInput(milestoneQuery,Object.fromEntries(params));
    return ok(await listMilestones(actor,query),{requestId});
  }catch(error){return errorResponse(error,requestId);}
}
export async function POST(request:NextRequest){
  const requestId=crypto.randomUUID();
  try{
    const actor=await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    const key=requiredIdempotencyKey(request.headers);
    const input=await parseJson(request,milestoneInput);
    return ok(await mutateMilestone(actor,input,key,requestId),{requestId});
  }catch(error){return errorResponse(error,requestId);}
}
