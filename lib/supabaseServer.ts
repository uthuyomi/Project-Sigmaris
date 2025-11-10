// /lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Server (Service Role Mode)
 * -----------------------------------------
 * ✅ システム・Webhook・バッチ処理専用クライアント
 * - 認証不要のサーバーサイド操作（RLS無効）
 * - Service Role Key を利用して全権限アクセス可能
 * -----------------------------------------
 */

export const getSupabaseServer = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // ← これが重要

  if (!url || !key) {
    console.error("❌ Missing Supabase environment variables");
    throw new Error("Supabase credentials not found");
  }

  console.log("🧠 SupabaseServer initialized (service-role mode)");
  return createClient(url, key);
};
