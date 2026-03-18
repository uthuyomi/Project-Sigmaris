import type { supabaseServer } from "@/lib/supabase-server";

export async function loadCoreHistory(params: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  sessionId: string;
  userId: string;
  limit?: number;
}): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const limit = typeof params.limit === "number" ? params.limit : 16;
  try {
    const { data } = await params.supabase
      .from("common_messages")
      .select("role, content, created_at")
      .eq("session_id", params.sessionId)
      .eq("user_id", params.userId)
      .eq("app", "touhou")
      .order("created_at", { ascending: false })
      .limit(limit);

    const rows = Array.isArray(data) ? (data as any[]) : [];
    const mapped = rows
      .map((r) => {
        const roleRaw = typeof r?.role === "string" ? String(r.role) : "";
        const content = typeof r?.content === "string" ? String(r.content) : "";
        const role =
          roleRaw === "user" ? "user" : roleRaw === "ai" ? "assistant" : null;
        if (!role || !content.trim()) return null;
        return { role, content };
      })
      .filter(Boolean) as Array<{ role: "user" | "assistant"; content: string }>;

    return mapped.reverse();
  } catch {
    return [];
  }
}
