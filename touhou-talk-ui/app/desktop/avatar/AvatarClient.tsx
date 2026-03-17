"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreAdapter,
} from "@assistant-ui/react";
import DesktopLiveAvatar from "@/components/desktop/DesktopLiveAvatar";

function isElectronUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return String(navigator.userAgent ?? "").includes("Electron");
}

export default function AvatarClient() {
  const sp = useSearchParams();
  const char = String(sp.get("char") ?? "").trim() || null;
  const enabled = useMemo(() => isElectronUa(), []);

  if (!enabled) {
    return (
      <div className="flex h-dvh w-full items-center justify-center text-sm text-muted-foreground">
        Desktop avatar window is only available in the Electron app.
      </div>
    );
  }

  if (!char) {
    return (
      <div className="flex h-dvh w-full items-center justify-center text-sm text-muted-foreground">
        Missing character id.
      </div>
    );
  }

  const store = useMemo<ExternalStoreAdapter>(
    () => ({
      isDisabled: true,
      isRunning: false,
      isLoading: false,
      messages: [],
      onNew: async (_message: AppendMessage) => {
        // no-op (avatar window is view-only)
      },
      adapters: {
        threadList: {
          isLoading: false,
          threadId: undefined,
          threads: [],
          archivedThreads: [],
          onSwitchToNewThread: undefined,
          onSwitchToThread: undefined,
          onRename: undefined,
          onArchive: undefined,
          onUnarchive: undefined,
          onDelete: undefined,
        },
      },
    }),
    [],
  );

  const runtime = useExternalStoreRuntime(store);

  return (
    <div className="h-dvh w-full bg-background">
      <AssistantRuntimeProvider runtime={runtime}>
        <DesktopLiveAvatar characterId={char} className="h-full w-full" />
      </AssistantRuntimeProvider>
    </div>
  );
}
