export type SessionMessageRouteContext = {
  params: Promise<{ sessionId: string }>;
};

export type SessionMessageStage =
  | "validate-request"
  | "load-context"
  | "decide-pipeline"
  | "delegate-legacy";
