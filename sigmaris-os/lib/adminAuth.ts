import { redirect } from "next/navigation";
import { getSupabaseAuth, getSupabaseComponent } from "@/lib/supabaseServer";

export function adminEmail(): string {
  return String(process.env.SIGMARIS_ADMIN_EMAIL || "kaiseif4e@gmail.com")
    .trim()
    .toLowerCase();
}

export async function requireAdminForRoute() {
  const supabase = await getSupabaseAuth();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, user: null };
  const email = String(user.email || "").trim().toLowerCase();
  if (!email || email !== adminEmail()) return { ok: false as const, user };
  return { ok: true as const, user };
}

export async function requireAdminForPage() {
  const supabase = await getSupabaseComponent();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");
  const email = String(user.email || "").trim().toLowerCase();
  if (!email || email !== adminEmail()) redirect("/");
  return user;
}

