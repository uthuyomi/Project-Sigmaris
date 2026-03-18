import { NextRequest } from "next/server";

export function wantsStream(req: NextRequest) {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/event-stream")) return true;
  const url = new URL(req.url);
  return url.searchParams.get("stream") === "1";
}

export function envFlag(name: string, defaultValue: boolean) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return defaultValue;
}

export function enforceOrigin(req: NextRequest) {
  const allowedRaw = String(process.env.TOUHOU_ALLOWED_ORIGINS ?? "").trim();
  const reqOrigin = req.headers.get("origin");
  const sameOrigin = new URL(req.url).origin;

  if (!reqOrigin) return;

  const isLoopbackHost = (host: string) =>
    host === "localhost" || host === "127.0.0.1" || host === "::1";

  const tryParse = (o: string) => {
    try {
      return new URL(o);
    } catch {
      return null;
    }
  };

  if (reqOrigin === "null") {
    const ua = req.headers.get("user-agent") ?? "";
    const same = tryParse(sameOrigin);
    if (ua.includes("Electron") && same && isLoopbackHost(same.hostname)) return;
  }

  const allowed = allowedRaw
    ? allowedRaw.split(",").map((s: string) => s.trim()).filter(Boolean)
    : [sameOrigin];

  if (!allowed.includes(reqOrigin)) {
    const reqU = tryParse(reqOrigin);
    const sameU = tryParse(sameOrigin);
    if (reqU && sameU && reqU.protocol === sameU.protocol && reqU.port === sameU.port) {
      if (isLoopbackHost(reqU.hostname) && isLoopbackHost(sameU.hostname)) return;
    }

    throw new Error(`Origin not allowed: ${reqOrigin} (expected ${allowed.join(", ")})`);
  }
}
