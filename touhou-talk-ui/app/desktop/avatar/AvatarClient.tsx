"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreAdapter,
} from "@assistant-ui/react";
import DesktopLiveAvatar from "@/components/desktop/DesktopLiveAvatar";
import { GripHorizontalIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";

const POPOUT_HEARTBEAT_KEY = "touhou.desktop.avatar.popout.heartbeatUntil";

function isElectronUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return String(navigator.userAgent ?? "").includes("Electron");
}

export default function AvatarClient() {
  useSearchParams(); // keep Next.js route reactive; pop-out character is fixed below.
  const char = "reimu";
  const enabled = useMemo(() => isElectronUa(), []);
  const [hovered, setHovered] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

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

  const nudgeResize = useCallback((delta: number) => {
    if (typeof window === "undefined") return;
    try {
      const w = Math.max(260, Math.min(900, Math.trunc(window.outerWidth + delta)));
      const h = Math.max(260, Math.min(1100, Math.trunc(window.outerHeight + delta)));
      window.resizeTo(w, h);
    } catch {
      // ignore
    }
  }, []);

  const closeWindow = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(POPOUT_HEARTBEAT_KEY);
    } catch {
      // ignore
    }
    try {
      window.close();
    } catch {
      // ignore
    }
  }, []);

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-transparent"
      onMouseEnter={() => {
        if (hideTimerRef.current != null) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        setHovered(true);
      }}
      onMouseLeave={() => {
        if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current);
        // Small delay prevents flicker when crossing the top overlay edge.
        hideTimerRef.current = window.setTimeout(() => {
          setHovered(false);
          hideTimerRef.current = null;
        }, 160);
      }}
    >
      {/* Frameless window controls: show when the window is hovered. */}
      <div className="absolute inset-x-0 top-0 z-50 h-16">
        {/* Controls */}
        <div
          className="mx-auto mt-2 flex h-9 w-[calc(100%-16px)] max-w-[520px] items-center gap-1 rounded-full border border-border/60 bg-background/35 px-2 text-xs text-foreground/80 shadow-sm backdrop-blur transition-opacity"
          style={{ ...( { WebkitAppRegion: "drag" } as any), opacity: hovered ? 1 : 0 }}
        >
          <div className="flex min-w-0 items-center gap-1 truncate px-1">
            <GripHorizontalIcon className="size-4 opacity-80" />
            <span>ドラッグで移動 / リサイズ</span>
          </div>

          <div className="ml-auto flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as any}>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/40 hover:bg-background/60"
              onClick={() => nudgeResize(-40)}
              title="少し小さくする"
            >
              <MinusIcon className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/40 hover:bg-background/60"
              onClick={() => nudgeResize(+40)}
              title="少し大きくする"
            >
              <PlusIcon className="size-4" />
            </button>

            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
              onClick={closeWindow}
              title="閉じる"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>
      <AssistantRuntimeProvider runtime={runtime}>
        <DesktopLiveAvatar characterId={char} className="h-full w-full" />
      </AssistantRuntimeProvider>
    </div>
  );
}
