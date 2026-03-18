export function looksLikeMissingColumn(err: unknown, column: string) {
  const msg =
    (typeof (err as { message?: unknown } | null)?.message === "string"
      ? String((err as { message?: unknown }).message)
      : "") || String(err ?? "");
  return msg.includes(column) && (msg.includes("column") || msg.includes("schema"));
}

export function clampNum(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function uniqMerge(base: string[], add: string[], max: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of [...base, ...add]) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}