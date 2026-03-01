import { Suspense } from "react";
import { redirect } from "next/navigation";
import ChatClient from "./ChatClient";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function safeNextPath(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!s.startsWith("/")) return "";
  if (s.startsWith("//")) return "";
  if (s.includes("://")) return "";
  return s.length > 2048 ? s.slice(0, 2048) : s;
}

export default async function ChatPage(props: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  // PWA / home-screen entry should always show login when needed.
  if (!data.user) {
    const sp = new URLSearchParams();
    const raw = props.searchParams ?? {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v) sp.set(k, v);
    }
    const next = safeNextPath(`/chat/session${sp.toString() ? `?${sp.toString()}` : ""}`);
    redirect(`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-white/40">
            読み込み中…
          </div>
        }
      >
        <ChatClient />
      </Suspense>
    </div>
  );
}
