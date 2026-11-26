export type Page<T> = { items: T[]; page: number; limit: number; total: number; canCreate?: boolean };
export type Project = {
  id: string; name: string; code: string; status: string; visibility: "full" | "summary";
  canEdit: boolean; canArchive: boolean; description?: string | null; location?: string;
  startDate?: string; expectedEndDate?: string; actualEndDate?: string | null; updatedAt?: string;
};
export type Site = { id: string; projectId: string; name: string; location: string; status: string;
  updatedAt: string; canEdit: boolean; canEditDetails: boolean; canArchive: boolean };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
  let result: { data?: T; error?: { message?: string; code?: string } };
  try { result = await response.json() as typeof result; }
  catch { throw new Error(`Server returned an unexpected response (${response.status}).`); }
  if (!response.ok || result.error) throw new Error(result.error?.message ?? `Request failed (${response.status}).`);
  if (result.data === undefined) throw new Error("Response missing data.");
  return result.data;
}
export function jsonRequest(method: "POST" | "PATCH", data: object, key?: string): RequestInit {
  return { method, headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify(data) };
}
