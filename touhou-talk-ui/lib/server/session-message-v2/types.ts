export type SessionMessageRouteContext = {
  params: Promise<{ sessionId: string }>;
};

export type SessionMessageStage =
  | "validate-request"
  | "load-context"
  | "decide-pipeline"
  | "delegate-legacy";

export type PersonaChatResponse = { reply: string; meta?: Record<string, unknown> };

export type PersonaIntentLabel =
  | "banter"
  | "chitchat"
  | "advice"
  | "task"
  | "incident"
  | "lore"
  | "roleplay_scene"
  | "meta"
  | "safety"
  | "unclear";

export type PersonaOutputStyle = "normal" | "bullet_3" | "choice_2";
export type PersonaUrgency = "low" | "normal" | "high";
export type PersonaSafetyRisk = "none" | "low" | "med" | "high";

export type PersonaIntentResponse = {
  intent: PersonaIntentLabel;
  confidence: number;
  output_style: PersonaOutputStyle;
  allowed_humor: boolean;
  urgency: PersonaUrgency;
  needs_clarify: boolean;
  clarify_question: string;
  safety_risk: PersonaSafetyRisk;
};

export type Phase04Attachment = {
  type: "upload";
  attachment_id: string;
  file_name: string;
  mime_type: string;
  kind: string;
  parsed_excerpt?: string;
};

export type Phase04LinkAnalysis = {
  type: "link_analysis";
  url: string;
  provider: "web_fetch" | "web_search" | "github_repo_search";
  results: Array<{
    title?: string;
    snippet?: string;
    url?: string;
    repository_url?: string;
    name?: string;
    owner?: string;
  }>;
};

export type RelationshipScoreResponse = {
  delta?: { trust?: number; familiarity?: number } | null;
  confidence?: number | null;
  reasons?: string[] | null;
  scopeHints?: string[] | null;
  memory?: {
    topics_add?: string[] | null;
    emotions_add?: string[] | null;
    recurring_issues_add?: string[] | null;
    traits_add?: string[] | null;
  } | null;
};

export type RelationshipState = { trust: number; familiarity: number };
export type UserMemoryState = {
  topics: string[];
  emotions: string[];
  recurring_issues: string[];
  traits: string[];
};