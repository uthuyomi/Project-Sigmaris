"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
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
  useSearchParams(); // keep Next.js route reactive; pop-out character is fixed below.
  const char = "reimu";
  const enabled = useMemo(() => isElectronUa(), []);

  useEffect(() => {
    // Make the page background fully transparent for the frameless window.
    // We restore previous values on unmount so this doesn't leak to other routes.
    const root = document.documentElement;
    const body = document.body;
    const prevRootBg = root.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const prevRootClass = root.className;
    const prevBodyClass = body.className;

    root.style.backgroundColor = "transparent";
    body.style.backgroundColor = "transparent";
    root.className = `${root.className} desktop-avatar-transparent`.trim();
    body.className = `${body.className} desktop-avatar-transparent`.trim();

    return () => {
      root.style.backgroundColor = prevRootBg;
      body.style.backgroundColor = prevBodyBg;
      root.className = prevRootClass;
      body.className = prevBodyClass;
    };
  }, []);

  if (!enabled) {
    return (
      <div className="flex h-dvh w-full items-center justify-center text-sm text-muted-foreground">
        Desktop avatar window is only available in the Electron app.
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
    <div className="relative h-dvh w-full overflow-hidden bg-transparent">
      {/* Frameless window: provide a small drag region (no visible panel). */}
      <div
        className="absolute inset-x-0 top-0 h-8"
        style={{ WebkitAppRegion: "drag" } as any}
      />
      <AssistantRuntimeProvider runtime={runtime}>
        <DesktopLiveAvatar characterId={char} className="h-full w-full" />
      </AssistantRuntimeProvider>
    </div>
  );
}
