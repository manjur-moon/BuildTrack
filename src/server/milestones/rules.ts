export function dhakaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const part = (type:string) => parts.find(p=>p.type===type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function isOverdue(status:string,due:string,today=dhakaDate()):boolean {
  return status === "PLANNED" && due < today;
}
export function canTransition(status:string,next:string,due:string,today=dhakaDate()):boolean {
  return status === "PLANNED" && (["ACHIEVED","CANCELLED"].includes(next) || (next === "MISSED" && due < today));
}
