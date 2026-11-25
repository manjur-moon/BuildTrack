import { ok } from "@/server/api/response";

/** Public liveness check. Do NOT expose database details or deployment secrets. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return ok({ service: "buildtrack", status: "ok" });
}
