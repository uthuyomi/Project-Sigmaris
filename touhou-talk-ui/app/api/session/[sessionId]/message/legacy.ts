export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Legacy implementation retained as a fallback during the strangler migration.

import { NextRequest, NextResponse } from "next/server";
import "server-only";

import { supabaseServer, requireUserId } from "@/lib/supabase-server";
import { buildTouhouPersonaSystem, genParamsFor, type TouhouChatMode } from "@/lib/touhouPersona";
import { worldEngineBaseUrl, worldEngineHeaders } from "@/app/api/world/_worldEngine";
import { resolveCoreBaseUrl } from "@/lib/server/session-message/core-base";
import { loadCoreHistory } from "@/lib/server/session-message/history";
import { isRecord, mergeMeta, sha256Hex } from "@/lib/server/session-message/meta";
import { enforceOrigin, envFlag, wantsStream } from "@/lib/server/session-message/request";
import type {
  PersonaIntentResponse,
  RelationshipState,
  UserMemoryState,
  Phase04Attachment,
  Phase04LinkAnalysis,
  RelationshipScoreResponse,
  PersonaChatResponse,

} from "@/lib/server/session-message-v2/types";

import {
  normalizePersonaIntent,
  shouldUseDirectorOverlay,
  fetchPersonaIntent,
  toSse,
  effectiveOutputStyle,
  outputStyleBlock,
  reimuDirectorOverlay,
  lintOutputStyle,
  coerceToForcedStyle

} from "@/lib/server/session-message-v2/director";

import {
  isFirstAssistantTurn,
  buildRecentUserText,
  sanitizeReplyByContext,
} from "@/lib/server/session-message-v2/sanitize";

import {
  clampText,
  extractUrls,
  containsAny,
  extractTheme,
  defaultNewsDomains,
  detectAutoBrowse,
  githubRepoQueryFromUrl,
  coreJson,
  uploadAndParseFiles,
  analyzeLinks,
  autoBrowseFromText,
  buildAugmentedMessage
} from "@/lib/server/session-message-v2/retrieval";

import {
  retrievalSystemHint,
  toStateSnapshotRow,
} from "@/lib/server/session-message-v2/persistence";

function looksLikeMissingColumn(err: unknown, column: string) {
  const msg =
    (typeof (err as { message?: unknown } | null)?.message === "string"
      ? String((err as { message?: unknown }).message)
      : "") || String(err ?? "");
  return msg.includes(column) && (msg.includes("column") || msg.includes("schema"));
}

function clampNum(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function uniqMerge(base: string[], add: string[], max: number) {
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

async function loadRelationshipAndMemoryBestEffort(params: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  userId: string;
  characterId: string;
}): Promise<{ relationship: RelationshipState; memory: UserMemoryState | null }> {
  let trust = 0;
  let familiarity = 0;
  const memScopeKey = `char:${params.characterId}`;

  try {
    const { data } = await params.supabase
      .from("player_character_relations")
      .select("trust,familiarity")
      .eq("user_id", params.userId)
      .eq("character_id", params.characterId)
      .maybeSingle();
    trust = clampNum((data as any)?.trust ?? 0, -1, 1, 0);
    familiarity = clampNum((data as any)?.familiarity ?? 0, 0, 1, 0);
  } catch (e) {
    if (looksLikeMissingColumn(e, "familiarity")) {
      // Migration not applied yet: treat as default.
      trust = 0;
      familiarity = 0;
    }
  }

  try {
    const { data } = await params.supabase
      .from("touhou_user_memory")
      .select("topics,emotions,recurring_issues,traits")
      .eq("user_id", params.userId)
      .eq("scope_key", memScopeKey)
      .maybeSingle();

    const topics = Array.isArray((data as any)?.topics) ? ((data as any).topics as string[]) : [];
    const emotions = Array.isArray((data as any)?.emotions) ? ((data as any).emotions as string[]) : [];
    const recurring = Array.isArray((data as any)?.recurring_issues)
      ? ((data as any).recurring_issues as string[])
      : [];
    const traits = Array.isArray((data as any)?.traits) ? ((data as any).traits as string[]) : [];

    return {
      relationship: { trust, familiarity },
      memory: {
        topics: topics.map((s) => String(s ?? "").trim()).filter(Boolean),
        emotions: emotions.map((s) => String(s ?? "").trim()).filter(Boolean),
        recurring_issues: recurring.map((s) => String(s ?? "").trim()).filter(Boolean),
        traits: traits.map((s) => String(s ?? "").trim()).filter(Boolean),
      },
    };
  } catch (e) {
    if (looksLikeMissingColumn(e, "touhou_user_memory") || looksLikeMissingColumn(e, "recurring_issues")) {
      return { relationship: { trust, familiarity }, memory: null };
    }
    return { relationship: { trust, familiarity }, memory: null };
  }
}

function relationshipStanceLabel(rel: RelationshipState) {
  const t = clampNum(rel.trust, -1, 1, 0);
  const f = clampNum(rel.familiarity, 0, 1, 0);
  const trustBand =
    t <= -0.6 ? "不信（強）" : t <= -0.2 ? "不信" : t < 0.2 ? "中立" : t < 0.6 ? "信頼" : "信頼（強）";
  const famBand = f < 0.25 ? "低" : f < 0.6 ? "中" : "高";
  return { trustBand, famBand };
}

function buildRelationshipMemoryOverlay(params: {
  characterId: string;
  rel: RelationshipState;
  mem: UserMemoryState | null;
}): string {
  const { trustBand, famBand } = relationshipStanceLabel(params.rel);
  const trust = clampNum(params.rel.trust, -1, 1, 0);
  const familiarity = clampNum(params.rel.familiarity, 0, 1, 0);

  const lines: string[] = [];
  lines.push("# Relationship / Memory (internal)");
  lines.push("- IMPORTANT: Do not mention these numbers or labels directly to the user.");
  lines.push(`- relationship.trust: ${trust.toFixed(3)} (range -1..1) / band=${trustBand}`);
  lines.push(`- relationship.familiarity: ${familiarity.toFixed(3)} (range 0..1) / band=${famBand}`);

  const style: string[] = [];
  if (trust <= -0.6) style.push("Very cautious: prioritize verification questions; avoid strong assertions.");
  else if (trust <= -0.2) style.push("Cautious: reduce certainty; confirm intent before advising.");
  else if (trust >= 0.6) style.push("High trust: allow warmer reassurance and concrete suggestions.");
  else if (trust >= 0.2) style.push("Neutral-positive: be helpful and steady; avoid overfamiliar leaps.");

  if (familiarity >= 0.7) style.push("High familiarity: more casual phrasing is OK (still in-character).");
  else if (familiarity <= 0.2) style.push("Low familiarity: keep a bit more distance; do not assume intimacy.");

  if (style.length) {
    lines.push(`- Style tuning: ${style.join(" ")}`);
  }

  lines.push("- Output guardrails for negative trust:");
  lines.push("  - Do NOT insult or judge the user.");
  lines.push("  - Reduce certainty; ask clarifying questions when needed.");
  lines.push("  - Keep a cooperative tone even when cautious.");

  if (params.mem) {
    const topics = params.mem.topics.slice(0, 8);
    const emotions = params.mem.emotions.slice(0, 8);
    const recurring = params.mem.recurring_issues.slice(0, 8);
    const traits = params.mem.traits.slice(0, 8);

    lines.push("");
    lines.push("# User memory (extracted)");
    if (topics.length) lines.push(`- topics: ${topics.join(", ")}`);
    if (emotions.length) lines.push(`- emotions: ${emotions.join(", ")}`);
    if (recurring.length) lines.push(`- recurring_issues: ${recurring.join(", ")}`);
    if (traits.length) lines.push(`- traits: ${traits.join(", ")}`);
    lines.push("- IMPORTANT: Use this only when relevant; do not recite it as a list.");
  }

  return lines.join("\n");
}

type WorldPromptContext = {
  world_id: string;
  location_id: string;
  state: Record<string, unknown> | null;
  recent_events: Array<{ event_type: string; summary: string; created_at?: string | null }>;
};

async function loadWorldPromptContextBestEffort(params: {
  worldId: string | null;
  locationId: string | null;
}): Promise<WorldPromptContext | null> {
  const worldId = String(params.worldId ?? "").trim();
  const locationId = String(params.locationId ?? "").trim();
  if (!worldId) return null;

  const base = worldEngineBaseUrl();
  const headers = worldEngineHeaders();
  const qs = new URLSearchParams({ world_id: worldId, location_id: locationId }).toString();

  const [stateRes, recentRes] = await Promise.all([
    fetch(`${base}/world/state?${qs}`, { headers, cache: "no-store" }).catch(() => null),
    fetch(`${base}/world/recent?${qs}&limit=8`, { headers, cache: "no-store" }).catch(() => null),
  ]);

  const state = stateRes && (stateRes as Response).ok ? await (stateRes as Response).json().catch(() => null) : null;
  const recentJson =
    recentRes && (recentRes as Response).ok ? await (recentRes as Response).json().catch(() => null) : null;
  const recent_events = Array.isArray((recentJson as any)?.recent_events)
    ? ((recentJson as any).recent_events as any[])
        .map((e) => ({
          event_type: String(e?.event_type ?? "event"),
          summary: String(e?.summary ?? "").trim(),
          created_at: e?.created_at ? String(e.created_at) : null,
        }))
        .filter((e) => e.summary)
    : [];

  return {
    world_id: worldId,
    location_id: locationId,
    state: isRecord(state) ? (state as Record<string, unknown>) : null,
    recent_events,
  };
}

function buildWorldOverlay(world: WorldPromptContext | null): string | null {
  if (!world) return null;

  const lines: string[] = [];
  lines.push("# World (snapshot)");
  lines.push(`- world_id: ${world.world_id}`);
  lines.push(`- location_id: ${world.location_id || "(none)"}`);

  const s = world.state || {};
  const timeOfDay = typeof s.time_of_day === "string" ? s.time_of_day : null;
  const weather = typeof s.weather === "string" ? s.weather : null;
  const season = typeof s.season === "string" ? s.season : null;
  const moon = typeof s.moon_phase === "string" ? s.moon_phase : null;
  const anomaly = typeof s.anomaly === "string" ? s.anomaly : null;
  if (timeOfDay) lines.push(`- time_of_day: ${timeOfDay}`);
  if (weather) lines.push(`- weather: ${weather}`);
  if (season) lines.push(`- season: ${season}`);
  if (moon) lines.push(`- moon_phase: ${moon}`);
  if (anomaly) lines.push(`- anomaly: ${anomaly}`);

  if (world.recent_events.length) {
    lines.push("- recent_events:");
    for (const e of world.recent_events.slice(-8)) {
      lines.push(`  - ${e.event_type}: ${e.summary}`);
    }
  }

  lines.push("- IMPORTANT: Use this as ambient context; do not dump it verbatim.");
  return lines.join("\n");
}

async function scoreRelationshipTurn(params: {
  base: string;
  accessToken: string | null;
  sessionId: string;
  characterId: string;
  chatMode: TouhouChatMode;
  userText: string;
  assistantText: string;
  currentRelationship: { trust: number; familiarity: number };
}): Promise<RelationshipScoreResponse | null> {
  const url = `${params.base}/persona/relationship/score`;
  const scopeKey = `char:${params.characterId}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {}),
      },
      body: JSON.stringify({
        session_id: params.sessionId,
        character_id: params.characterId,
        chat_mode: params.chatMode,
        scope_key: scopeKey,
        user_message: params.userText,
        assistant_message: params.assistantText,
        relationship: params.currentRelationship,
      }),
    });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as unknown;
    if (!isRecord(j)) return null;
    return j as RelationshipScoreResponse;
  } catch {
    return null;
  }
}

async function updateRelationshipAndMemoryBestEffort(params: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  base: string;
  accessToken: string | null;
  sessionId: string;
  userId: string;
  characterId: string;
  chatMode: TouhouChatMode;
  userText: string;
  assistantText: string;
}) {
  const enabled = envFlag("TOUHOU_RELATIONSHIP_ENABLED", true);
  if (!enabled) return;
  const memScopeKey = `char:${params.characterId}`;

  const confThreshold = clampNum(
    process.env.TOUHOU_RELATIONSHIP_CONFIDENCE_THRESHOLD ?? "0.55",
    0.0,
    1.0,
    0.55,
  );
  const alpha = clampNum(process.env.TOUHOU_RELATIONSHIP_EMA_ALPHA ?? "0.15", 0.0, 1.0, 0.15);
  const trustStepSize = clampNum(process.env.TOUHOU_RELATIONSHIP_TRUST_STEP ?? "0.02", 0.0, 0.2, 0.02);
  const famStepSize = clampNum(process.env.TOUHOU_RELATIONSHIP_FAMILIARITY_STEP ?? "0.02", 0.0, 0.2, 0.02);
  const maxDeltaTrust = clampNum(process.env.TOUHOU_RELATIONSHIP_TRUST_MAX_DELTA ?? "0.02", 0.0, 0.3, 0.02);
  const maxDeltaFam = clampNum(process.env.TOUHOU_RELATIONSHIP_FAMILIARITY_MAX_DELTA ?? "0.03", 0.0, 0.3, 0.03);

  let prevTrust = 0;
  let prevFam = 0;
  let prevRelRev = 0;
  try {
    const { data } = await params.supabase
      .from("player_character_relations")
      .select("trust,familiarity,rev")
      .eq("user_id", params.userId)
      .eq("character_id", params.characterId)
      .maybeSingle();
    prevTrust = clampNum((data as any)?.trust ?? 0, -1, 1, 0);
    prevFam = clampNum((data as any)?.familiarity ?? 0, 0, 1, 0);
    prevRelRev = clampNum((data as any)?.rev ?? 0, 0, Number.MAX_SAFE_INTEGER, 0);
  } catch (e) {
    if (looksLikeMissingColumn(e, "familiarity") || looksLikeMissingColumn(e, "rev")) return;
  }

  const score = await scoreRelationshipTurn({
    base: params.base,
    accessToken: params.accessToken,
    sessionId: params.sessionId,
    characterId: params.characterId,
    chatMode: params.chatMode,
    userText: params.userText,
    assistantText: params.assistantText,
    currentRelationship: { trust: prevTrust, familiarity: prevFam },
  });
  if (!score) return;

  const confidence = clampNum(score.confidence ?? 0, 0, 1, 0);
  if (confidence < confThreshold) return;

  const stepTrust = clampNum(score.delta?.trust ?? 0, -2, 2, 0);
  const stepFam = clampNum(score.delta?.familiarity ?? 0, -2, 2, 0);

  const dTrust = Math.max(-maxDeltaTrust, Math.min(maxDeltaTrust, stepTrust * trustStepSize));
  const dFam = Math.max(-maxDeltaFam, Math.min(maxDeltaFam, stepFam * famStepSize));

  const nextTrust = clampNum(prevTrust + alpha * dTrust, -1, 1, prevTrust);
  const nextFam = clampNum(prevFam + alpha * dFam, 0, 1, prevFam);

  try {
    const { error } = await params.supabase.from("player_character_relations").upsert(
      {
        user_id: params.userId,
        character_id: params.characterId,
        scope_key: "global",
        trust: nextTrust,
        familiarity: nextFam,
        rev: prevRelRev + 1,
        last_updated: new Date().toISOString(),
      } as any,
      { onConflict: "user_id,character_id" },
    );
    if (error) {
      if (looksLikeMissingColumn(error, "scope_key") || looksLikeMissingColumn(error, "familiarity")) return;
      console.warn("[touhou] relationship upsert failed:", error);
      return;
    }
  } catch (e) {
    if (looksLikeMissingColumn(e, "scope_key") || looksLikeMissingColumn(e, "familiarity")) return;
    console.warn("[touhou] relationship upsert failed:", e);
    return;
  }

  const mem = score.memory ?? null;
  if (!mem) return;

  const addTopics = Array.isArray(mem.topics_add) ? mem.topics_add : [];
  const addEmotions = Array.isArray(mem.emotions_add) ? mem.emotions_add : [];
  const addRecurring = Array.isArray(mem.recurring_issues_add) ? mem.recurring_issues_add : [];
  const addTraits = Array.isArray(mem.traits_add) ? mem.traits_add : [];
  if (addTopics.length + addEmotions.length + addRecurring.length + addTraits.length <= 0) return;

  try {
    const { data } = await params.supabase
      .from("touhou_user_memory")
      .select("topics,emotions,recurring_issues,traits,rev")
      .eq("user_id", params.userId)
      .eq("scope_key", memScopeKey)
      .maybeSingle();

    const prevTopics = Array.isArray((data as any)?.topics) ? ((data as any).topics as string[]) : [];
    const prevEmotions = Array.isArray((data as any)?.emotions) ? ((data as any).emotions as string[]) : [];
    const prevRecurring = Array.isArray((data as any)?.recurring_issues)
      ? ((data as any).recurring_issues as string[])
      : [];
    const prevTraits = Array.isArray((data as any)?.traits) ? ((data as any).traits as string[]) : [];
    const prevMemRev = clampNum((data as any)?.rev ?? 0, 0, Number.MAX_SAFE_INTEGER, 0);

    const nextTopics = uniqMerge(prevTopics, addTopics, 48);
    const nextEmotions = uniqMerge(prevEmotions, addEmotions, 48);
    const nextRecurring = uniqMerge(prevRecurring, addRecurring, 48);
    const nextTraits = uniqMerge(prevTraits, addTraits, 48);

    const { error } = await params.supabase.from("touhou_user_memory").upsert(
      {
        user_id: params.userId,
        scope_key: memScopeKey,
        topics: nextTopics,
        emotions: nextEmotions,
        recurring_issues: nextRecurring,
        traits: nextTraits,
        rev: prevMemRev + 1,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id,scope_key" },
    );
    if (error) console.warn("[touhou] memory upsert failed:", error);
  } catch (e) {
    if (looksLikeMissingColumn(e, "touhou_user_memory")) return;
    console.warn("[touhou] memory upsert failed:", e);
  }
}

// Character persona is injected via `persona_system` (system-side) to avoid dilution over long chats.

export async function runLegacySessionMessageRoute(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    enforceOrigin(req);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sessionId } = await context.params;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await supabaseServer();

  // Basic per-user rate limit (best-effort).
  const minIntervalMsRaw = Number(process.env.TOUHOU_RATE_LIMIT_MS ?? "1200");
  const minIntervalMs = Number.isFinite(minIntervalMsRaw)
    ? Math.max(0, Math.min(60_000, minIntervalMsRaw))
    : 1200;
  if (minIntervalMs > 0) {
    try {
      const { data } = await supabase
        .from("common_messages")
        .select("created_at")
        .eq("user_id", userId)
        .eq("app", "touhou")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastIso = (data as any)?.created_at;
      const lastTs = typeof lastIso === "string" ? Date.parse(lastIso) : NaN;
      if (Number.isFinite(lastTs) && Date.now() - lastTs < minIntervalMs) {
        return NextResponse.json(
          { error: "Rate limited" },
          { status: 429, headers: { "Retry-After": String(Math.ceil(minIntervalMs / 1000)) } }
        );
      }
    } catch {
      // ignore
    }
  }

  let accessToken: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
  } catch {
    accessToken = null;
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "multipart/form-data required" },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const characterId = formData.get("characterId");
  const text = formData.get("text");
  const coreModeRaw = formData.get("coreMode");
  if (
    typeof characterId !== "string" ||
    typeof text !== "string" ||
    !characterId ||
    !text.trim()
  ) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const urls = extractUrls(text);

  // ownership check
  const { data: conv, error: convError } = await supabase
    .from("common_sessions")
    .select("id, chat_mode, layer, location")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("app", "touhou")
    .maybeSingle();

  if (convError) {
    console.error("[touhou] conversation select error:", convError);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found or forbidden" },
      { status: 403 }
    );
  }

  const coreHistory = await loadCoreHistory({ supabase, sessionId, userId, limit: 16 });
  const base = await resolveCoreBaseUrl({
    supabase,
    requestedMode: typeof coreModeRaw === "string" ? coreModeRaw : null,
  });

  const chatModeRaw =
    conv && typeof (conv as Record<string, unknown>).chat_mode === "string"
      ? String((conv as Record<string, unknown>).chat_mode)
      : null;
  const chatMode: TouhouChatMode =
    chatModeRaw === "roleplay" || chatModeRaw === "coach" ? chatModeRaw : "partner";

  const relationshipEnabled = envFlag("TOUHOU_RELATIONSHIP_ENABLED", true);
  const worldPromptEnabled = envFlag("TOUHOU_WORLD_PROMPT_ENABLED", true);
  const layer =
    conv && typeof (conv as Record<string, unknown>).layer === "string"
      ? String((conv as Record<string, unknown>).layer)
      : null;
  const location =
    conv && typeof (conv as Record<string, unknown>).location === "string"
      ? String((conv as Record<string, unknown>).location)
      : null;

  const relMemPromise = relationshipEnabled
    ? loadRelationshipAndMemoryBestEffort({ supabase, userId, characterId })
    : Promise.resolve({ relationship: { trust: 0, familiarity: 0 }, memory: null });
  const worldPromise = worldPromptEnabled
    ? loadWorldPromptContextBestEffort({ worldId: layer, locationId: location })
    : Promise.resolve(null);

  const intentPromise: Promise<PersonaIntentResponse | null> = shouldUseDirectorOverlay({
    characterId,
    chatMode,
  })
    ? fetchPersonaIntent({
        base,
        accessToken,
        sessionId,
        characterId,
        chatMode,
        message: text.trim(),
        history: coreHistory,
      })
    : Promise.resolve(null);
  const isProd = process.env.NODE_ENV === "production";
  const uploadsEnabled = envFlag("TOUHOU_UPLOAD_ENABLED", !isProd);
  const linkAnalysisEnabled = envFlag("TOUHOU_LINK_ANALYSIS_ENABLED", !isProd);
  const autoBrowseEnabled = envFlag("TOUHOU_AUTO_BROWSE_ENABLED", false);

  const phase04Uploads = uploadsEnabled
    ? await uploadAndParseFiles({ base, accessToken, files })
    : [];

  let phase04Links: Phase04LinkAnalysis[] = [];
  if (linkAnalysisEnabled && urls.length > 0) {
    phase04Links = await analyzeLinks({ base, accessToken, urls });
  } else if (autoBrowseEnabled) {
    phase04Links = await autoBrowseFromText({ base, accessToken, userText: text.trim() });
  } else {
    phase04Links = [];
  }
  const augmentedText = buildAugmentedMessage({
    userText: text.trim(),
    uploads: phase04Uploads,
    linkAnalyses: phase04Links,
  });
  const coreAttachments = [...phase04Uploads, ...phase04Links] as unknown as Record<
    string,
    unknown
  >[];

  // store user message
  const { error: userInsertError } = await supabase
    .from("common_messages")
    .insert({
      session_id: sessionId,
      user_id: userId,
      app: "touhou",
      role: "user",
      content: text,
      speaker_id: null,
      meta: {
        phase04: {
          uploads: phase04Uploads,
          link_analyses: phase04Links,
        },
      },
    });

  if (userInsertError) {
    console.error("[touhou] user message insert error:", userInsertError);
    return NextResponse.json(
      { error: "Failed to save user message" },
      { status: 500 }
    );
  }

  const isSeedTurn = isFirstAssistantTurn(coreHistory);
  let intent = await intentPromise;
  if (intent) {
    intent = normalizePersonaIntent({
      intent,
      history: coreHistory,
      userText: text.trim(),
      characterId,
      chatMode,
    });
  }

  const [relMem, worldCtx] = await Promise.all([relMemPromise, worldPromise]);
  const personaSystemBase = buildTouhouPersonaSystem(characterId, {
    chatMode,
    includeExamples: isSeedTurn,
    includeRoleplayExamples: isSeedTurn,
  });

  // Turn-scoped tuning: prefer "tell the model" over "delete later".
  const lowerRecentUser = buildRecentUserText({ history: coreHistory, currentUserText: text });
  const saisenRe = /(?:賽銭箱|お賽銭|賽銭|寄付)/i;
  const userMentionsSaisen = saisenRe.test(lowerRecentUser);
  const assistantRecentText = coreHistory
    .filter((m) => m.role === "assistant")
    .slice(-3)
    .map((m) => String(m.content ?? ""))
    .join("\n");
  const assistantRecentlyMentionedSaisen = saisenRe.test(assistantRecentText);

  const turnTuningLines: string[] = [];
  if (chatMode === "roleplay" && characterId === "reimu" && !userMentionsSaisen) {
    if (assistantRecentlyMentionedSaisen) {
      turnTuningLines.push("- このターンは賽銭/寄付ネタを出さない（クールダウン）。");
    } else {
      turnTuningLines.push("- 賽銭/寄付ネタは最大1文まで（連発しない）。");
    }
  }

  const directorOverlay = intent ? reimuDirectorOverlay(intent) : "";
  const relationshipOverlay =
    relationshipEnabled && relMem
      ? buildRelationshipMemoryOverlay({ characterId, rel: relMem.relationship, mem: relMem.memory })
      : null;
  const worldOverlay = buildWorldOverlay(worldCtx);

  const personaSystem = [
    personaSystemBase,
    relationshipOverlay,
    worldOverlay,
    turnTuningLines.length > 0 ? `# Turn constraints\n${turnTuningLines.join("\n")}` : null,
    directorOverlay || null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const retrievalHint = retrievalSystemHint({ linkAnalyses: phase04Links });
  const personaSystemWithRetrieval = retrievalHint ? `${personaSystem}\n\n# Retrieval\n${retrievalHint}` : personaSystem;
  const personaSystemSha256 = sha256Hex(personaSystemWithRetrieval);
  const gen = genParamsFor(characterId);
  const streamMode = wantsStream(req);

  // Clarify short-circuit: when the intent director asks for a single confirm-question,
  // return it directly (saves latency/cost and prevents style drift).
  if (
    intent?.needs_clarify &&
    intent.intent === "unclear" &&
    (intent.clarify_question || "").trim() &&
    Number.isFinite(intent.confidence) &&
    intent.confidence >= 0.85
  ) {
    const replyFinal = String(intent.clarify_question || "").trim();

    const mergedMeta = mergeMeta(null, {
      persona_system_sha256: personaSystemSha256,
      chat_mode: chatMode,
      character_id: characterId,
      seed_turn: isSeedTurn,
      director_overlay: true,
      intent: intent.intent,
      intent_confidence: intent.confidence,
      intent_output_style: intent.output_style,
      intent_effective_output_style: effectiveOutputStyle(intent),
      intent_allowed_humor: intent.allowed_humor,
      intent_urgency: intent.urgency,
      intent_needs_clarify: intent.needs_clarify,
      intent_safety_risk: intent.safety_risk,
      forced_output_style_passed: true,
      forced_output_style_retry: false,
      forced_output_style_reason: "clarify_short_circuit",
    });

    const { error: aiInsertError } = await supabase.from("common_messages").insert({
      session_id: sessionId,
      user_id: userId,
      app: "touhou",
      role: "ai",
      content: replyFinal,
      speaker_id: characterId,
      meta: mergedMeta,
    });

    if (aiInsertError) {
      console.error("[touhou] ai message insert error:", aiInsertError);
      return NextResponse.json({ error: "Failed to save ai message" }, { status: 500 });
    }

    if (isRecord(mergedMeta)) {
      try {
        await supabase.from("common_state_snapshots").insert([
          toStateSnapshotRow({
            userId,
            sessionId,
            meta: mergedMeta as Record<string, unknown>,
          }),
        ]);
      } catch (e) {
        console.warn("[touhou] state snapshot insert failed:", e);
      }
    }

    await updateRelationshipAndMemoryBestEffort({
      supabase,
      base,
      accessToken,
      sessionId,
      userId,
      characterId,
      chatMode,
      userText: text,
      assistantText: replyFinal,
    });

    if (!streamMode) {
      return NextResponse.json({ role: "ai", content: replyFinal, meta: mergedMeta });
    }

    const ts = new TransformStream();
    const writer = ts.writable.getWriter();
    try {
      await writer.write(toSse("start", { sessionId }));
      await writer.write(toSse("delta", { text: replyFinal }));
      await writer.write(toSse("done", { reply: replyFinal, meta: mergedMeta }));
    } catch {
      // ignore
    } finally {
      let replyGuarded = "";
      try {
        await writer.close();
      } catch {
        // ignore
      }
    }

    return new NextResponse(ts.readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  if (!streamMode) {
    const r = await fetch(`${base}/persona/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        user_id: userId,
        session_id: sessionId,
        message: augmentedText,
        history: coreHistory,
        character_id: characterId,
        chat_mode: chatMode,
        persona_system: personaSystemWithRetrieval,
        gen,
        attachments: coreAttachments,
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[touhou] core /persona/chat failed:", r.status, detail);
      return NextResponse.json({ error: "Persona core failed" }, { status: 502 });
    }

    const data = (await r.json()) as PersonaChatResponse;
    const replySafe =
      typeof data.reply === "string" && data.reply.trim().length > 0
        ? data.reply
        : "（応答生成が一時的に利用できません。）";

    const replyGuarded = sanitizeReplyByContext({
      characterId,
      chatMode,
      reply: replySafe,
      history: coreHistory,
      currentUserText: text,
    });

    let replyFinal = replyGuarded;
    let forcedStylePassed = true;
    let forcedStyleRetry = false;
    let forcedStyleReason = "";

    if (intent) {
      const style = effectiveOutputStyle(intent);
      const lint1 = lintOutputStyle({ style, intent, reply: replyFinal });
      if (!lint1.ok) {
        forcedStylePassed = false;
        forcedStyleReason = lint1.reason;

        // No extra LLM call: do a minimal local coercion to the forced style.
        const coerced = coerceToForcedStyle({ style, intent, reply: replyFinal });
        if (coerced.applied) {
          const lint2 = lintOutputStyle({ style, intent, reply: coerced.reply });
          forcedStyleRetry = true;
          if (lint2.ok) {
            forcedStylePassed = true;
            forcedStyleReason = "";
            replyFinal = coerced.reply;
          } else {
            forcedStyleReason = `coerce_${lint2.reason}`;
          }
        }
      }
    }

    const mergedMeta = mergeMeta(data.meta ?? null, {
      persona_system_sha256: personaSystemSha256,
      chat_mode: chatMode,
      character_id: characterId,
      seed_turn: isSeedTurn,
      ...(intent
        ? {
            director_overlay: true,
            intent: intent.intent,
            intent_confidence: intent.confidence,
            intent_output_style: intent.output_style,
            intent_effective_output_style: effectiveOutputStyle(intent),
            intent_allowed_humor: intent.allowed_humor,
            intent_urgency: intent.urgency,
            intent_needs_clarify: intent.needs_clarify,
            intent_safety_risk: intent.safety_risk,
            forced_output_style_passed: forcedStylePassed,
            forced_output_style_retry: forcedStyleRetry,
            forced_output_style_reason: forcedStyleReason,
          }
        : { director_overlay: false }),
    });

    const { error: aiInsertError } = await supabase
      .from("common_messages")
      .insert({
        session_id: sessionId,
        user_id: userId,
        app: "touhou",
        role: "ai",
        content: replyFinal,
        speaker_id: characterId,
        meta: mergedMeta,
      });

    if (aiInsertError) {
      console.error("[touhou] ai message insert error:", aiInsertError);
      return NextResponse.json(
        { error: "Failed to save ai message" },
        { status: 500 }
      );
    }

    if (isRecord(mergedMeta)) {
      try {
        await supabase.from("common_state_snapshots").insert([
          toStateSnapshotRow({
            userId,
            sessionId,
            meta: mergedMeta as Record<string, unknown>,
          }),
        ]);
      } catch (e) {
        console.warn("[touhou] state snapshot insert failed:", e);
      }
    }

    await updateRelationshipAndMemoryBestEffort({
      supabase,
      base,
      accessToken,
      sessionId,
      userId,
      characterId,
      chatMode,
      userText: text,
      assistantText: replyFinal,
    });

    return NextResponse.json({
      role: "ai",
      content: replyFinal,
      meta: mergedMeta,
    });
  }

  // ---- streaming: proxy SSE from Sigmaris core and persist on done ----
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/persona/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        user_id: userId,
        session_id: sessionId,
        message: augmentedText,
        history: coreHistory,
        character_id: characterId,
        chat_mode: chatMode,
        persona_system: personaSystemWithRetrieval,
        gen,
        attachments: coreAttachments,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[touhou] core stream fetch failed:", { base, msg });
    return NextResponse.json(
      {
        error: "Persona core is unreachable",
        base,
        detail: msg,
      },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("[touhou] core stream failed:", upstream.status, detail);
    return NextResponse.json(
      { error: "Persona core stream failed", detail },
      { status: 502 }
    );
  }

  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const touhouUiMeta = {
    chat_mode: chatMode,
    character_id: characterId,
    persona_system_sha256: personaSystemSha256,
    seed_turn: isSeedTurn,
    ...(intent
      ? {
          director_overlay: true,
          intent: intent.intent,
          intent_confidence: intent.confidence,
          intent_output_style: intent.output_style,
          intent_effective_output_style: effectiveOutputStyle(intent),
          intent_allowed_humor: intent.allowed_humor,
          intent_urgency: intent.urgency,
          intent_needs_clarify: intent.needs_clarify,
          intent_safety_risk: intent.safety_risk,
        }
      : { director_overlay: false }),
  };

  let replyAcc = "";
  let finalMeta: Record<string, unknown> = mergeMeta(null, touhouUiMeta);

  (async () => {
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buf.indexOf("\n\n");
          if (idx === -1) break;
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);

          const lines = block.split("\n");
          let event = "message";
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          const dataRaw = dataLines.join("\n");

          if (event === "delta") {
            try {
                const parsed = JSON.parse(dataRaw);
                const textPart =
                  isRecord(parsed) && typeof parsed.text === "string"
                    ? parsed.text
                    : "";
                if (textPart) replyAcc += textPart;
                await writer.write(toSse("delta", { text: textPart }));
              } catch {
                await writer.write(`event: delta\ndata: ${dataRaw}\n\n`);
              }
            } else if (event === "done") {
              try {
                const parsed = JSON.parse(dataRaw);
                const reply =
                  isRecord(parsed) && typeof parsed.reply === "string"
                    ? parsed.reply
                    : replyAcc;

                finalMeta =
                  isRecord(parsed) && isRecord(parsed.meta)
                    ? mergeMeta(parsed.meta, touhouUiMeta)
                    : mergeMeta(null, touhouUiMeta);
                const replyGuarded = sanitizeReplyByContext({
                  characterId,
                  chatMode,
                  reply,
                  history: coreHistory,
                  currentUserText: text,
                });

                let replyFinal = replyGuarded;
                let forcedStylePassed = true;
                let forcedStyleRetry = false;
                let forcedStyleReason = "";

                if (intent) {
                  const style = effectiveOutputStyle(intent);
                  const lint1 = lintOutputStyle({ style, intent, reply: replyFinal });
                  if (!lint1.ok) {
                    forcedStylePassed = false;
                    forcedStyleReason = lint1.reason;

                    const coerced = coerceToForcedStyle({ style, intent, reply: replyFinal });
                    if (coerced.applied) {
                      const lint2 = lintOutputStyle({ style, intent, reply: coerced.reply });
                      forcedStyleRetry = true;
                      if (lint2.ok) {
                        forcedStylePassed = true;
                        forcedStyleReason = "";
                        replyFinal = coerced.reply;
                      } else {
                        forcedStyleReason = `coerce_${lint2.reason}`;
                      }
                    }
                  }

                  finalMeta = mergeMeta(finalMeta, {
                    forced_output_style_passed: forcedStylePassed,
                    forced_output_style_retry: forcedStyleRetry,
                    forced_output_style_reason: forcedStyleReason,
                  });
                }

                replyAcc = replyFinal;
                await writer.write(toSse("done", { reply: replyFinal, meta: finalMeta }));
              } catch {
                await writer.write(`event: done\ndata: ${dataRaw}\n\n`);
              }
          } else if (event === "start") {
            await writer.write(toSse("start", { sessionId }));
          } else if (event === "error") {
            await writer.write(toSse("error", { error: dataRaw }));
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await writer.write(toSse("error", { error: msg }));
    } finally {
      let replyGuarded = "";
      try {
        const replySafe =
          typeof replyAcc === "string" && replyAcc.trim().length > 0
            ? replyAcc
            : "すみません、うまく返事を作れませんでした。もう一度送ってください。";

        replyGuarded = sanitizeReplyByContext({
          characterId,
          chatMode,
          reply: replySafe,
          history: coreHistory,
          currentUserText: text,
        });

        await supabase.from("common_messages").insert({
          session_id: sessionId,
          user_id: userId,
          app: "touhou",
          role: "ai",
          content: replyGuarded,
          speaker_id: characterId,
          meta: finalMeta,
        });
      } catch (e) {
        console.warn("[touhou] persist ai message failed:", e);
      }

      try {
        await supabase.from("common_state_snapshots").insert([
          toStateSnapshotRow({ userId, sessionId, meta: finalMeta }),
        ]);
      } catch (e) {
        console.warn("[touhou] state snapshot insert failed:", e);
      }

      try {
        await updateRelationshipAndMemoryBestEffort({
          supabase,
          base,
          accessToken,
          sessionId,
          userId,
          characterId,
          chatMode,
          userText: text,
          assistantText: replyGuarded,
        });
      } catch {
        // ignore
      }

      try {
        await writer.close();
      } catch {
        // ignore
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
