/** All computations in integer minor units; no IEEE-754 currency math. */
export function cents(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new Error("Invalid monetary amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function money(value: bigint): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
export function financialTotals(budget: string | null, actual: string) {
  const a = cents(actual), b = budget === null ? null : cents(budget);
  return { approved: b === null ? null : money(b), actual: money(a),
    remaining: b === null ? null : money(b - a),
    utilization: b === null || b === 0n ? null : money((a * 10000n + b / 2n) / b),
    overrun: b === null ? null : money(a > b ? a - b : 0n) };
}
