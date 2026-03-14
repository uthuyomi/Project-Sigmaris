import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SettingsClient from "@/app/settings/SettingsClient";

export default async function SettingsPage() {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  if (ua.includes("Electron")) return <SettingsClient />;
  redirect("/settings/web");
}
