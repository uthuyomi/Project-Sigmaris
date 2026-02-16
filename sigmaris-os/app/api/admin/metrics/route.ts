export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { adminEmail, requireAdminForRoute } from "@/lib/adminAuth";

type AppName = "sigmaris" | "touhou";

function isoDaysAgo(days: number) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function isoHoursAgo(hours: number) {
  const d = new Date(Date.now() - hours * 60 * 60 * 1000);
  return d.toISOString();
}

function hourJstFromIso(iso: string): number | null {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  // Shift +9h then read UTC hour => JST hour.
  const jst = new Date(ts + 9 * 60 * 60 * 1000);
  return jst.getUTCHours();
}

async function countAuthUsers(): Promise<number | null> {
  try {
    const sb = getSupabaseServer();
    let page = 1;
    const perPage = 1000;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const { data, error } = await sb.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) return null;
      const users = Array.isArray((data as any)?.users) ? (data as any).users : [];
      total += users.length;
      if (users.length < perPage) break;
      page += 1;
    }
    return total;
  } catch {
    return null;
  }
}

async function countRows(table: string, filter: Record<string, string>): Promise<number> {
  const sb = getSupabaseServer();
  let q: any = sb.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { count } = await q;
  return Number(count ?? 0) || 0;
}

async function collectRecentMessageStats(params: {
  app: AppName;
  sinceIso: string;
  sinceIso24h: string;
}) {
  const sb = getSupabaseServer();

  const hourly7d = Array.from({ length: 24 }, () => 0);
  const hourly24h = Array.from({ length: 24 }, () => 0);
  const users7d = new Set<string>();
  const users24h = new Set<string>();
  let messages7d = 0;
  let messages24h = 0;

  // Paginate to avoid hard limits. Keep it bounded (admin view).
  const pageSize = 1000;
  let offset = 0;
  for (let page = 0; page < 30; page++) {
    const { data, error } = await sb
      .from("common_messages")
      .select("user_id, created_at")
      .eq("app", params.app)
      .gte("created_at", params.sinceIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) break;
    const rows = Array.isArray(data) ? (data as any[]) : [];
    if (rows.length === 0) break;

    for (const r of rows) {
      const uid = typeof r?.user_id === "string" ? r.user_id : "";
      const createdAt = typeof r?.created_at === "string" ? r.created_at : "";
      if (uid) users7d.add(uid);
      if (createdAt) {
        messages7d += 1;
        const h = hourJstFromIso(createdAt);
        if (h != null) hourly7d[h] += 1;
        if (createdAt >= params.sinceIso24h) {
          if (uid) users24h.add(uid);
          messages24h += 1;
          if (h != null) hourly24h[h] += 1;
        }
      }
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }

  return {
    activeUsers7d: users7d.size,
    activeUsers24h: users24h.size,
    messages7d,
    messages24h,
    hourly7d,
    hourly24h,
  };
}

export async function GET() {
  const auth = await requireAdminForRoute();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const since7d = isoDaysAgo(7);
  const since24h = isoHoursAgo(24);

  const [authUsersTotal, sigCounts, touhouCounts, sigRecent, touhouRecent] =
    await Promise.all([
      countAuthUsers(),
      Promise.all([
        countRows("common_messages", { app: "sigmaris" }),
        countRows("common_sessions", { app: "sigmaris" }),
      ]),
      Promise.all([
        countRows("common_messages", { app: "touhou" }),
        countRows("common_sessions", { app: "touhou" }),
      ]),
      collectRecentMessageStats({ app: "sigmaris", sinceIso: since7d, sinceIso24h: since24h }),
      collectRecentMessageStats({ app: "touhou", sinceIso: since7d, sinceIso24h: since24h }),
    ]);

  const combinedHourly = Array.from({ length: 24 }, (_, h) => {
    return (sigRecent.hourly7d[h] ?? 0) + (touhouRecent.hourly7d[h] ?? 0);
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    adminEmail: adminEmail(),
    authUsersTotal,
    apps: {
      sigmaris: {
        messagesTotal: sigCounts[0],
        sessionsTotal: sigCounts[1],
        activeUsers7d: sigRecent.activeUsers7d,
        activeUsers24h: sigRecent.activeUsers24h,
        messages7d: sigRecent.messages7d,
        messages24h: sigRecent.messages24h,
      },
      touhou: {
        messagesTotal: touhouCounts[0],
        sessionsTotal: touhouCounts[1],
        activeUsers7d: touhouRecent.activeUsers7d,
        activeUsers24h: touhouRecent.activeUsers24h,
        messages7d: touhouRecent.messages7d,
        messages24h: touhouRecent.messages24h,
      },
    },
    hourlyJst: {
      combined: combinedHourly,
      sigmaris: sigRecent.hourly7d,
      touhou: touhouRecent.hourly7d,
    },
  });
}

