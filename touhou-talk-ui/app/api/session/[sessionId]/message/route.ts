export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { handleSessionMessageRoute } from "@/lib/server/session-message-v2/handler";
import type { SessionMessageRouteContext } from "@/lib/server/session-message-v2/types";

export async function POST(
  req: NextRequest,
  context: SessionMessageRouteContext,
) {
  return handleSessionMessageRoute(req, context);
}
