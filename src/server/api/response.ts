import { NextResponse } from "next/server";
import { ApiError } from "./errors";

export function ok<T>(data: T, init?: { status?: number; requestId?: string }) {
  return NextResponse.json(
    { data, meta: { requestId: init?.requestId ?? crypto.randomUUID() } },
    { status: init?.status ?? 200, headers: { "Cache-Control": "no-store" } },
  );
}

export function errorResponse(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}), requestId } }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  // Deliberately avoid database/secret/stack-trace exposure to clients.
  console.error(JSON.stringify({ level: "error", event: "api_unhandled", requestId, kind: error instanceof Error ? error.name : typeof error }));
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId } }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
