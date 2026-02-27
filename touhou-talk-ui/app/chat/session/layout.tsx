import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ★ await を付ける（これが足りてなかった）
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login?next=/chat/session");
  }

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden max-lg:fixed max-lg:left-0 max-lg:right-0 max-lg:overscroll-none"
      style={{
        top: "var(--app-vvo, 0px)",
        height: "var(--app-vvh, 100dvh)",
      }}
    >
      {children}
    </div>
  );
}
