import { NextRequest, NextResponse } from "next/server";

import { runLegacySessionMessageRoute } from "@/app/api/session/[sessionId]/message/legacy";

import type { SessionMessageRouteContext, SessionMessageStage } from "./types";

function buildExecutionPlan(): SessionMessageStage[] {
  return [
    "validate-request",
    "load-context",
    "decide-pipeline",
    "delegate-legacy",
  ];
}

function shouldUseLegacyFallback() {
  const raw = String(process.env.TOUHOU_SESSION_MESSAGE_V2_FORCE_LEGACY ?? "1")
    .trim()
    .toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
}

export async function handleSessionMessageRoute(
  req: NextRequest,
  context: SessionMessageRouteContext,
): Promise<Response> {
  const plan = buildExecutionPlan();

  if (plan.length === 0) {
    return NextResponse.json({ error: "Session message execution plan is empty" }, { status: 500 });
  }

  if (shouldUseLegacyFallback()) {
    return runLegacySessionMessageRoute(req, context);
  }

  return runLegacySessionMessageRoute(req, context);
}
