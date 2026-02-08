// ============================================================
// Sigmaris AEI Core API Client (Full Spec: AEI + PersonaOS + Persona Core v2)
// ============================================================

// ----------------------------------------------
// BASE URL
// ----------------------------------------------
export const BASE = (
  process.env.NEXT_PUBLIC_SIGMARIS_CORE ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

// ----------------------------------------------
// 共通 Fetch Wrapper
// ----------------------------------------------
async function request(endpoint: string, options?: RequestInit): Promise<any> {
  const url = `${BASE}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      console.error(
        "[Sigmaris API Error]",
        endpoint,
        res.status,
        json ?? "(no json)"
      );
      throw new Error(`API error at ${endpoint}: status ${res.status}`);
    }

    return json;
  } catch (err) {
    console.error("[Sigmaris API Failure]", endpoint, err);
    throw err;
  }
}

// ============================================================
// 型定義（B-Spec Full）
// ============================================================

export interface TraitVector {
  calm: number;
  empathy: number;
  curiosity: number;
}

export interface IdentityBaseline {
  calm: number;
  empathy: number;
  curiosity: number;
}

export interface IdentitySnapshot {
  calm?: number;
  empathy?: number;
  curiosity?: number;
  reflection?: string;
  meta_summary?: string;
  persona_vector?: TraitVector;
  baseline?: IdentityBaseline | null;
  timestamp?: string;
  identity_snapshot?: any;
  [key: string]: any;
}

export interface EmotionState {
  emotion?: string;
  intensity?: number;
  reason?: string;
  trait_shift?: TraitVector;
  meta?: Record<string, any>;
  [key: string]: any;
}

export interface RewardState {
  global_reward?: number;
  trait_reward?: TraitVector;
  reason?: string;
  [key: string]: any;
}

export interface ValueState {
  importance?: string[];
  weight?: number;
  tension?: number;
  baseline_shift?: TraitVector;
  [key: string]: any;
}

export interface MetaState {
  meta_summary?: string;
  root_cause?: string;
  adjustment?: TraitVector;
  risk?: Record<string, boolean>;
  [key: string]: any;
}

export interface LongTermState {
  longterm?: any;
  [key: string]: any;
}

export interface MemoryDump {
  episodes?: any[];
  count?: number;
  [key: string]: any;
}

// ============================================================
// B-Spec Sync Payload（最新版 /sync）
// ============================================================

export interface SyncPayload {
  chat: { user: string | null; ai: string | null } | null;

  context: {
    traits: TraitVector;
    safety: any | null;
    summary: any | null;
    recent: any | null;
  };

  identity?: {
    reflection?: string;
    meta_summary?: string;
    growth?: number;
    baseline?: TraitVector | null;
    identitySnapshot?: any;
  };
}

export interface SyncResponse {
  status?: string;
  identity?: IdentitySnapshot;
  episode_count?: number;
  updated_persona?: Partial<TraitVector> & {
    reflection?: string;
    meta_summary?: string;
    growth?: number;
  };
  emotion?: EmotionState;
  reward?: RewardState;
  value?: ValueState;
  meta?: MetaState;
  longterm?: LongTermState;
  episode?: any;
  [key: string]: any;
}

// ============================================================
// ★ AEI-Core Sync（人格統合の中心 API）
// ============================================================

export async function requestSync(payload: SyncPayload): Promise<SyncResponse> {
  return request("/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ============================================================
// 下層 API 群（補助）
// ============================================================

export async function reflect(text: string) {
  return request("/reflect", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function introspect() {
  return request("/introspect", { method: "POST" });
}

export async function longterm(): Promise<LongTermState> {
  return request("/longterm", { method: "POST" });
}

export async function meta(): Promise<{ meta: MetaState }> {
  return request("/meta", { method: "POST" });
}

export async function reward(): Promise<{ reward: RewardState }> {
  return request("/reward", { method: "POST" });
}

export async function rewardState() {
  return request("/reward/state", { method: "GET" });
}

export async function emotion(
  text: string
): Promise<{ emotion: EmotionState }> {
  return request("/emotion", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function value(): Promise<{ value: ValueState }> {
  return request("/value", { method: "POST" });
}

export async function valueState() {
  return request("/value/state", { method: "GET" });
}

export async function memory(): Promise<MemoryDump> {
  return request("/memory", { method: "GET" });
}

export async function getIdentity(): Promise<IdentitySnapshot> {
  return request("/identity", { method: "GET" });
}

// ============================================================
// Persona-DB API (v0.2)
// ============================================================

export async function getConceptMap(
  minScore: number = 0.0,
  limit: number = 64
) {
  return request(`/db/concepts?min_score=${minScore}&limit=${limit}`, {
    method: "GET",
  });
}

export async function getEpisodes(sessionId?: string) {
  const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return request(`/db/episodes${q}`, { method: "GET" });
}

export async function getIdentityEvents() {
  return request(`/db/identity`, { method: "GET" });
}

export async function getGrowthLogs(limit: number = 50) {
  return request(`/db/growth?limit=${limit}`, { method: "GET" });
}

// ============================================================
// ★ PersonaOS Decision API（旧）
// ============================================================

export interface PersonaDecision {
  allow_reply: boolean;
  preferred_state: string;
  tone: string;
  temperature: number;
  top_p: number;
  need_reflection: boolean;
  need_introspection: boolean;
  apply_contradiction_note: boolean;
  apply_identity_anchor: boolean;
  updated_traits: TraitVector;
  reward: any;
  debug: any;
}

export interface PersonaDecisionResponse {
  decision: PersonaDecision;
  identity: any;
}

export interface PersonaDecisionRequest {
  user: string;
  context: Record<string, any>;
  session_id: string;
  user_id: string;
}

export async function requestPersonaDecision(
  payload: PersonaDecisionRequest
): Promise<PersonaDecisionResponse> {
  return request("/persona/decision", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ============================================================
// ★ Persona Core v2（完全版） Decision API
// ============================================================

export interface PersonaV2DecisionRequest {
  user_id: string;
  request: { message: string };
  value_state: {
    stability: number;
    openness: number;
    safety_bias: number;
    user_alignment: number;
  };
  trait_state: {
    calm: number;
    empathy: number;
    curiosity: number;
  };
  overload_score?: number | null;
  safety_flag?: string | null;
  prev_global_state?: string | null;
}

export interface PersonaV2DecisionResponse {
  reply: string;
  global_state: any;
  meta: any;
}

export async function requestPersonaV2Decision(
  payload: PersonaV2DecisionRequest
): Promise<PersonaV2DecisionResponse> {
  return request("/persona/v2/decision", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
