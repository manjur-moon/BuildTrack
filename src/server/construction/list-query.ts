import { ApiError } from "@/server/api/errors";
import type { Prisma } from "@/generated/prisma/client";

const projectStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
const siteStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "CLOSED"] as const;
const projectSorts = ["createdAt", "name", "code", "status", "startDate", "expectedEndDate"] as const;
const siteSorts = ["createdAt", "name", "location", "status"] as const;
const commonKeys = ["q", "page", "limit", "status", "sortBy", "order", "from", "to"] as const;

export type ProjectSort = (typeof projectSorts)[number];
export type SiteSort = (typeof siteSorts)[number];
export type ListOrder = "asc" | "desc";
export type ProjectListQuery = {
  page: number; limit: number; q: string; status?: (typeof projectStatuses)[number];
  sortBy: ProjectSort; order: ListOrder; from?: string; to?: string;
};
export type SiteListQuery = {
  page: number; limit: number; q: string; status?: (typeof siteStatuses)[number];
  sortBy: SiteSort; order: ListOrder; from?: string; to?: string; projectId?: string;
};

function invalid(message: string): never { throw new ApiError(422, "VALIDATION_ERROR", message); }
function optionalValue(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value === null || value.trim() === "" ? undefined : value.trim();
}
function positiveInt(value: string | undefined, fallback: number, maximum: number, key: string): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return invalid(`Invalid ${key}; use a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) return invalid(`${key} must be at most ${maximum}.`);
  return parsed;
}
function dateOnly(value: string | undefined, key: string): string | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid(`${key} must be YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return invalid(`Invalid ${key} calendar date.`);
  }
  return value;
}
function oneOf<T extends string>(value: string | undefined, accepted: readonly T[], key: string): T | undefined {
  if (value === undefined) return undefined;
  if (!(accepted as readonly string[]).includes(value)) return invalid(`Invalid ${key}.`);
  return value as T;
}
function parseBase(params: URLSearchParams, allowedKeys: readonly string[]) {
  for (const key of params.keys()) {
    if (!allowedKeys.includes(key)) invalid(`Unknown query parameter: ${key}.`);
    if (params.getAll(key).length !== 1) invalid(`Duplicate query parameter: ${key}.`);
  }
  const q = optionalValue(params, "q") ?? "";
  if (q.length > 100) invalid("Search must be at most 100 characters.");
  const from = dateOnly(optionalValue(params, "from"), "from");
  const to = dateOnly(optionalValue(params, "to"), "to");
  if (from && to && from > to) invalid("from cannot be later than to.");
  const page = positiveInt(optionalValue(params, "page"), 1, 10000, "page");
  const limit = positiveInt(optionalValue(params, "limit"), 20, 100, "limit");
  return { page, limit, q, from, to, order: oneOf(optionalValue(params, "order"), ["asc", "desc"] as const, "order") ?? "desc" };
}

/** All inputs are allowlisted. Organization and role scope are added in the services, never accepted from the URL. */
export function parseProjectListQuery(params: URLSearchParams): ProjectListQuery {
  const common = parseBase(params, commonKeys);
  return { ...common,
    status: oneOf(optionalValue(params, "status"), projectStatuses, "status"),
    sortBy: oneOf(optionalValue(params, "sortBy"), projectSorts, "sortBy") ?? "createdAt",
  };
}
export function parseSiteListQuery(params: URLSearchParams): SiteListQuery {
  const common = parseBase(params, [...commonKeys, "projectId"]);
  const projectId = optionalValue(params, "projectId");
  if (projectId && projectId.length > 128) invalid("projectId exceeds 128 characters.");
  return { ...common, projectId,
    status: oneOf(optionalValue(params, "status"), siteStatuses, "status"),
    sortBy: oneOf(optionalValue(params, "sortBy"), siteSorts, "sortBy") ?? "createdAt",
  };
}

export function projectListFilter(query: ProjectListQuery): Prisma.ProjectWhereInput {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { OR: [
      { name: { contains: query.q, mode: "insensitive" as const } },
      { code: { contains: query.q, mode: "insensitive" as const } },
    ] } : {}),
    ...(query.from || query.to ? { startDate: {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
    } } : {}),
  };
}
export function siteListFilter(query: SiteListQuery): Prisma.ConstructionSiteWhereInput {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.q ? { OR: [
      { name: { contains: query.q, mode: "insensitive" as const } },
      { location: { contains: query.q, mode: "insensitive" as const } },
    ] } : {}),
    ...(query.from || query.to ? { createdAt: {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86400000) } : {}),
    } } : {}),
  };
}
export function projectListOrder(query: ProjectListQuery): Prisma.ProjectOrderByWithRelationInput[] {
  return [{ [query.sortBy]: query.order }, { id: "desc" }];
}
export function siteListOrder(query: SiteListQuery): Prisma.ConstructionSiteOrderByWithRelationInput[] {
  return [{ [query.sortBy]: query.order }, { id: "desc" }];
}
export function listMeta(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasPrevious: page > 1, hasNext: page < totalPages };
}
