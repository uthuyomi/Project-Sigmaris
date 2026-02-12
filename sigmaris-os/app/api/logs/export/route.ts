export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

type IncludeKey =
  | "messages"
  | "state"
  | "telemetry"
  | "temporal_identity"
  | "subjectivity"
  | "failure"
  | "identity"
  | "trace_events";

function parseBool(v: string | null, fallback = false): boolean {
  if (v === null || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function clampInt(v: string | null, def: number, min: number, max: number): number {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseIncludeList(v: string | null): Set<IncludeKey> {
  const all: IncludeKey[] = [
    "messages",
    "state",
    "telemetry",
    "temporal_identity",
    "subjectivity",
    "failure",
    "identity",
    "trace_events",
  ];
  if (!v) return new Set(all);
  const parts = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set<IncludeKey>();
  for (const p of parts) {
    if ((all as string[]).includes(p)) set.add(p as IncludeKey);
  }
  return set.size ? set : new Set(all);
}

function publicConfig() {
  const enabled = (process.env.SIGMARIS_PORTFOLIO_PUBLIC_ENABLED ?? "")
    .trim()
    .toLowerCase();
  const userId = (process.env.SIGMARIS_PORTFOLIO_PUBLIC_USER_ID ?? "").trim();
  const ok = ["1", "true", "yes", "on"].includes(enabled) && !!userId;
  return { ok, userId };
}

function sanitizeExportForPublic(out: Record<string, any>) {
  // Hard rule: never export message contents in public mode.
  if (Array.isArray(out.messages)) {
    out.messages = out.messages.map((m: any) => ({
      id: m?.id ?? null,
      session_id: m?.session_id ?? null,
      app: m?.app ?? null,
      role: m?.role ?? null,
      created_at: m?.created_at ?? null,
    }));
  }

  // Meta fields may contain text excerpts (depending on backend trace settings).
  // Keep snapshots but remove meta-like fields to avoid leaks.
  if (Array.isArray(out.state)) {
    out.state = out.state.map((s: any) => ({ ...s, meta: null }));
  }
  if (Array.isArray(out.telemetry)) {
    out.telemetry = out.telemetry.map((t: any) => ({
      ...t,
      meta: null,
      reasons: null,
    }));
  }

  // Phase02-style snapshots can contain free-form strings depending on implementation.
  // For public portfolio export, keep structural IDs + timestamps only.
  if (Array.isArray(out.temporal_identity)) {
    out.temporal_identity = out.temporal_identity.map((x: any) => ({
      id: x?.id ?? null,
      session_id: x?.session_id ?? null,
      trace_id: x?.trace_id ?? null,
      ego_id: x?.ego_id ?? null,
      telemetry: x?.telemetry ?? null,
      created_at: x?.created_at ?? null,
    }));
  }
  if (Array.isArray(out.subjectivity)) {
    // subjectivity is expected to be structured/numeric; keep as-is.
  }
  if (Array.isArray(out.failure)) {
    // failure may include free-form reasons; keep as-is but remove nested strings if present in common shapes.
    out.failure = out.failure.map((f: any) => {
      const failure = f?.failure;
      if (!failure || typeof failure !== "object") return f;
      const shallow = { ...failure };
      if ("reasons" in shallow) shallow.reasons = null;
      if ("notes" in shallow) shallow.notes = null;
      return { ...f, failure: shallow };
    });
  }
  if (Array.isArray(out.identity)) {
    out.identity = out.identity.map((x: any) => ({
      id: x?.id ?? null,
      session_id: x?.session_id ?? null,
      trace_id: x?.trace_id ?? null,
      created_at: x?.created_at ?? null,
      snapshot: null,
    }));
  }
  if (Array.isArray(out.trace_events)) {
    // trace_events could contain arbitrary fields; omit for public export.
    out.trace_events = [];
  }

  out.public = true;
  return out;
}

export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    const pub = publicConfig();
    const isPublic = (authError || !user) && pub.ok;
    const viewerUserId = (user?.id as string | undefined) || (isPublic ? pub.userId : "");
    if (!viewerUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = (searchParams.get("session_id") ?? "").trim() || null;
    const limit = clampInt(searchParams.get("limit"), 200, 1, 2000);
    const include = parseIncludeList(searchParams.get("include"));
    const since = (searchParams.get("since") ?? "").trim() || null; // ISO string

    // For quick exports, allow disabling the heaviest tables.
    const includePhase02 = parseBool(searchParams.get("include_phase02"), true);

    const supabase = getSupabaseServer();

    const whereSession = (q: any) => (sessionId ? q.eq("session_id", sessionId) : q);
    const whereSince = (q: any) =>
      since ? q.gte("created_at", since) : q;

    const tasks: Record<string, PromiseLike<any>> = {};

    if (include.has("messages")) {
      let q = supabase
        .from("common_messages")
        .select("id, session_id, app, role, content, speaker_id, meta, created_at")
        .eq("user_id", viewerUserId)
        .order("created_at", { ascending: false })
        .limit(limit);
      q = whereSession(whereSince(q));
      tasks.messages = q;
    }

    if (include.has("state")) {
      let q = supabase
        .from("common_state_snapshots")
        .select(
          "id, session_id, trace_id, global_state, overload_score, reflective_score, memory_pointer_count, safety_flag, safety_risk_score, value_state, trait_state, meta, created_at"
        )
        .eq("user_id", viewerUserId)
        .order("created_at", { ascending: false })
        .limit(limit);
      q = whereSession(whereSince(q));
      tasks.state = q;
    }

    if (include.has("telemetry")) {
      let q = supabase
        .from("common_telemetry_snapshots")
        .select("id, session_id, trace_id, scores, ema, flags, reasons, meta, created_at")
        .eq("user_id", viewerUserId)
        .order("created_at", { ascending: false })
        .limit(limit);
      q = whereSession(whereSince(q));
      tasks.telemetry = q;
    }

    if (includePhase02) {
      if (include.has("temporal_identity")) {
        let q = supabase
          .from("common_temporal_identity_snapshots")
          .select("id, session_id, trace_id, ego_id, state, telemetry, created_at")
          .eq("user_id", viewerUserId)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSession(whereSince(q));
        tasks.temporal_identity = q;
      }

      if (include.has("subjectivity")) {
        let q = supabase
          .from("common_subjectivity_snapshots")
          .select("id, session_id, trace_id, subjectivity, created_at")
          .eq("user_id", viewerUserId)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSession(whereSince(q));
        tasks.subjectivity = q;
      }

      if (include.has("failure")) {
        let q = supabase
          .from("common_failure_snapshots")
          .select("id, session_id, trace_id, failure, created_at")
          .eq("user_id", viewerUserId)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSession(whereSince(q));
        tasks.failure = q;
      }

      if (include.has("identity")) {
        let q = supabase
          .from("common_identity_snapshots")
          .select("id, session_id, trace_id, snapshot, created_at")
          .eq("user_id", viewerUserId)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSession(whereSince(q));
        tasks.identity = q;
      }

      if (include.has("trace_events")) {
        let q = supabase
          .from("common_trace_events")
          .select("id, trace_id, event, fields, created_at")
          .eq("user_id", viewerUserId)
          .order("created_at", { ascending: false })
          .limit(limit);
        q = whereSince(q);
        // common_trace_events does not have session_id in schema; filter by trace_id is possible
        tasks.trace_events = q;
      }
    }

    const entries = Object.entries(tasks);
    const results = await Promise.all(entries.map(([, p]) => p));

    const out: Record<string, any> = {
      ok: true,
      exported_at: new Date().toISOString(),
      user_id: viewerUserId,
      filters: {
        session_id: sessionId,
        since,
        limit,
        include: Array.from(include.values()),
        include_phase02: includePhase02,
      },
    };

    for (let i = 0; i < entries.length; i++) {
      const key = entries[i][0];
      const { data, error } = results[i] ?? {};
      if (error) throw error;
      // Return ascending time for easier reading.
      out[key] = (data ?? []).slice().reverse();
    }

    if (isPublic) {
      return NextResponse.json(sanitizeExportForPublic(out));
    }

    return NextResponse.json(out);
  } catch (err: any) {
    console.error("[/api/logs/export] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
