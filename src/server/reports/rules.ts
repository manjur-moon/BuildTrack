export const REPORT_PAGE_SIZE = 20;
export function reportPage(value: unknown): number | null {
  if (value === undefined) return 1;
  return typeof value === "string" && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : null;
}
export function completionPercent(completed: number, total: number): string | null {
  return total === 0 ? null : (completed * 100 / total).toFixed(1);
}
export function dateLabel(date: Date): string { return date.toISOString().slice(0,10); }
