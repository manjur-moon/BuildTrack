/** Convert plain signed decimals to exact thousandths without rounding. */
export function toMilli(value: string): bigint {
  if (value !== value.trim() || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(value)) {
    throw new RangeError("Expected a plain decimal with up to three fractional digits");
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const magnitude = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return negative ? -magnitude : magnitude;
}
export function fromMilli(value: bigint): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  return `${neg ? "-" : ""}${abs / 1000n}.${(abs % 1000n).toString().padStart(3,"0")}`;
}
