import { createHash } from "crypto";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function sha256Hex(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function mergeMeta(
  base: unknown,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = isRecord(base) ? { ...(base as Record<string, unknown>) } : {};
  const cur = isRecord(out.touhou_ui) ? (out.touhou_ui as Record<string, unknown>) : {};
  out.touhou_ui = { ...cur, ...extra };
  return out;
}

export function withTtsReadingMeta(
  base: Record<string, unknown>,
  readingText: string | null,
  model: string | null,
): Record<string, unknown> {
  if (!readingText) return base;
  const tts = isRecord(base.tts) ? { ...(base.tts as Record<string, unknown>) } : {};
  tts.reading_text = readingText;
  if (model) tts.reading_model = model;
  return { ...base, tts };
}
