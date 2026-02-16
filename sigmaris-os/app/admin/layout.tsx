import React from "react";
import { requireAdminForPage } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminForPage();
  return <>{children}</>;
}

