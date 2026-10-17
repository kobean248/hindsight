export function toVectorLiteral(values: readonly number[]): string {
  return `[${values.join(",")}]`;
}

export function parseVector(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((entry) => Number(entry));
  if (typeof value === "string") {
    const body = value.trim().replace(/^\[/, "").replace(/\]$/, "");
    if (!body) return [];
    return body.split(",").map((entry) => Number(entry.trim()));
  }
  return null;
}

export function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}
