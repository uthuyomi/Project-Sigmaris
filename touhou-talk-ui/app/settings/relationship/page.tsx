import { Suspense } from "react";
import RelationshipSettingsClient from "./RelationshipSettingsClient";

export const dynamic = "force-dynamic";

export default function RelationshipSettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10">
      <Suspense fallback={<div className="text-muted-foreground text-sm">読み込み中…</div>}>
        <RelationshipSettingsClient />
      </Suspense>
    </div>
  );
}

