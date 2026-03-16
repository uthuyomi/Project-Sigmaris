"use client";

import { useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type CompleteAttachment,
  type ExternalStoreAdapter,
} from "@assistant-ui/react";

import { Thread } from "@/components/assistant-ui/thread";
import { ThreadSearch } from "@/components/assistant-ui/thread-search";
import { TouhouSidebar } from "@/components/assistant-ui/touhou-sidebar";
import { TouhouUiProvider } from "@/components/assistant-ui/touhou-ui-context";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

 import { CHARACTERS, isCharacterSelectable } from "@/data/characters";
import { getGroupsByLocation, canEnableGroup, GroupDef } from "@/data/group";
import { getDefaultChatMode } from "@/lib/touhou-settings";
import { buildRunJsonlFromMessages, parseArtifactText } from "@/lib/artifact/artifact-io";
import DesktopLiveAvatar from "@/components/desktop/DesktopLiveAvatar";

import {
  extractTextFromThreadMessageContent,
  talkMessageToThreadMessageLike,
  TouhouUploadAttachmentAdapter,
  type TalkUiMessage,
} from "@/lib/assistant-ui/touhou-external-store";


/* =========================
   Types
========================= */

type Message = TalkUiMessage;

type SessionSummary = {
  id: string;
  title: string;
  characterId: string;
  mode: "single" | "group";
  layer: string | null;
  location: string | null;
  chatMode: "partner" | "roleplay" | "coach";
};

type PanelGroupContext = {
  enabled: boolean;
  label: string;
  group: GroupDef;
};

type ChatGroupContext = {
  enabled: boolean;
  label: string;
  ui: {
    chatBackground?: string;
    accent?: string;
  };
  participants: Array<{
    id: string;
    name: string;
    title: string;
    ui: {
      chatBackground?: string | null;
      placeholder: string;
    };
    color?: {
      accent?: string;
    };
  }>;
};

type VscodeMeta = {
  diff?: string;
  touched_files?: string[];
  next_action?: string;
};

type ChatApiResponse = {
  role?: "ai" | "user";
  content: string;
  meta?: VscodeMeta | null;
  error?: string;
};

type CreateSessionResponse = {
  sessionId: string;
};

type VscodeState =
  | "idle"
  | "analyzing"
  | "diffing"
  | "analysis_done"
  | "diff_ready"
  | "applying"
  | "applied"
  | "error";

/* =========================
   Component
========================= */

function AutoCloseSidebarOnRequest(props: { requestId: number }) {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const prevRequestIdRef = useRef(props.requestId);

  useEffect(() => {
    if (prevRequestIdRef.current === props.requestId) return;
    prevRequestIdRef.current = props.requestId;

    // Close right away when user picks a session (mobile/tablet UX).
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  }, [props.requestId, isMobile, setOpen, setOpenMobile]);

  return null;
}

export default function ChatClient() {
  const searchParams = useSearchParams();
  const currentLayer = searchParams.get("layer");
  const currentLocationId = searchParams.get("loc");

  const isElectron = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return String(navigator.userAgent ?? "").includes("Electron");
  }, []);

  /* =========================
     State
  ========================= */

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(
    null,
  );

  const [desktopAvatarVisible, setDesktopAvatarVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = String(window.localStorage.getItem("touhou.desktop.avatar.visible") ?? "").trim();
    if (!v) return true;
    return v !== "0" && v.toLowerCase() !== "false";
  });

  const [desktopAvatarLayout, setDesktopAvatarLayout] = useState<"pip" | "dock">(() => {
    if (typeof window === "undefined") return "pip";
    const v = String(window.localStorage.getItem("touhou.desktop.avatar.layout") ?? "").trim().toLowerCase();
    return v === "dock" ? "dock" : "pip";
  });

  const [desktopAvatarDockWidth, setDesktopAvatarDockWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 360;
    const raw = String(window.localStorage.getItem("touhou.desktop.avatar.dockWidth") ?? "").trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 360;
    return Math.max(260, Math.min(640, Math.trunc(n)));
  });

  const [desktopAvatarPipRect, setDesktopAvatarPipRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  }>(() => {
    if (typeof window === "undefined") return { x: 0, y: 0, w: 340, h: 420 };
    const readNum = (k: string, fallback: number) => {
      const raw = String(window.localStorage.getItem(k) ?? "").trim();
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    };

    const w = Math.max(260, Math.min(520, Math.trunc(readNum("touhou.desktop.avatar.pip.w", 340))));
    const h = Math.max(260, Math.min(620, Math.trunc(readNum("touhou.desktop.avatar.pip.h", 420))));
    const x = Math.trunc(readNum("touhou.desktop.avatar.pip.x", 0));
    const y = Math.trunc(readNum("touhou.desktop.avatar.pip.y", 80));
    return { x, y, w, h };
  });

  const [desktopAvatarAvailRev, setDesktopAvatarAvailRev] = useState(0);
  const [desktopAvatarAvailable, setDesktopAvatarAvailable] = useState(false);

  const [artifactBusy, setArtifactBusy] = useState(false);

  const [messagesBySession, setMessagesBySession] = useState<
    Record<string, Message[]>
  >({});

  const [isRunningBySession, setIsRunningBySession] = useState<
    Record<string, boolean>
  >({});

  const appendMessage = useCallback(
    (m: Message) => {
      if (!activeSessionId) return;

      setMessagesBySession((prev) => ({
        ...prev,
        [activeSessionId]: [...(prev[activeSessionId] ?? []), m],
      }));
    },
    [activeSessionId],
  );

  const [mode] = useState<"single" | "group">("single");

  const autoSelectDoneRef = useRef(false);

  /* =========================
     Mobile UI
  ========================= */

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [hasSelectedOnce, setHasSelectedOnce] = useState(false);
  const [charactersCollapsed, setCharactersCollapsed] = useState(false);
  const [sidebarCloseRequestId, setSidebarCloseRequestId] = useState(0);

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1024px)").matches;
  });

  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("touhou.desktop.avatar.visible", desktopAvatarVisible ? "1" : "0");
      window.localStorage.setItem("touhou.desktop.avatar.layout", desktopAvatarLayout);
      window.localStorage.setItem("touhou.desktop.avatar.dockWidth", String(desktopAvatarDockWidth));
      window.localStorage.setItem("touhou.desktop.avatar.pip.x", String(desktopAvatarPipRect.x));
      window.localStorage.setItem("touhou.desktop.avatar.pip.y", String(desktopAvatarPipRect.y));
      window.localStorage.setItem("touhou.desktop.avatar.pip.w", String(desktopAvatarPipRect.w));
      window.localStorage.setItem("touhou.desktop.avatar.pip.h", String(desktopAvatarPipRect.h));
    } catch {
      // ignore
    }
  }, [desktopAvatarVisible, desktopAvatarLayout, desktopAvatarDockWidth, desktopAvatarPipRect]);

  const dockWrapRef = useRef<HTMLDivElement | null>(null);
  const dockDragRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const pipWrapRef = useRef<HTMLDivElement | null>(null);
  const pipDragRef = useRef<
    | {
        kind: "move";
        pointerId: number;
        startX: number;
        startY: number;
        startRect: { x: number; y: number; w: number; h: number };
      }
    | {
        kind: "resize";
        pointerId: number;
        startX: number;
        startY: number;
        startRect: { x: number; y: number; w: number; h: number };
      }
    | null
  >(null);

  const clampPipRect = useCallback(
    (rect: { x: number; y: number; w: number; h: number }) => {
      const wrap = pipWrapRef.current;
      const bounds = wrap?.getBoundingClientRect?.();
      const bw = Math.trunc(bounds?.width ?? 0);
      const bh = Math.trunc(bounds?.height ?? 0);

      const minW = 260;
      const minH = 260;
      const maxW = 520;
      const maxH = 620;

      const w = Math.max(minW, Math.min(maxW, Math.trunc(rect.w)));
      const h = Math.max(minH, Math.min(maxH, Math.trunc(rect.h)));

      const pad = 8;
      const maxX = bw > 0 ? Math.max(pad, bw - w - pad) : 10000;
      const maxY = bh > 0 ? Math.max(pad, bh - h - pad) : 10000;

      const x = Math.max(pad, Math.min(maxX, Math.trunc(rect.x)));
      const y = Math.max(pad, Math.min(maxY, Math.trunc(rect.y)));

      return { x, y, w, h };
    },
    [],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dockDragRef.current;
      if (!drag) return;
      if (e.pointerId !== drag.pointerId) return;
      const wrap = dockWrapRef.current;
      const wrapWidth = wrap?.getBoundingClientRect?.().width ?? 0;

      // Right dock: dragging left increases width, dragging right decreases.
      const next = Math.trunc(drag.startWidth + (drag.startX - e.clientX));

      const min = 260;
      const maxByWrap = wrapWidth > 0 ? Math.max(min, Math.trunc(wrapWidth - 420)) : 640; // keep chat usable
      const max = Math.max(min, Math.min(640, maxByWrap));
      setDesktopAvatarDockWidth(Math.max(min, Math.min(max, next)));
    };

    const onUp = (e: PointerEvent) => {
      const drag = dockDragRef.current;
      if (!drag) return;
      if (e.pointerId !== drag.pointerId) return;
      dockDragRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = pipDragRef.current;
      if (!drag) return;
      if (e.pointerId !== drag.pointerId) return;

      if (drag.kind === "move") {
        const next = {
          ...drag.startRect,
          x: drag.startRect.x + (e.clientX - drag.startX),
          y: drag.startRect.y + (e.clientY - drag.startY),
        };
        setDesktopAvatarPipRect(clampPipRect(next));
        return;
      }

      // resize (bottom-right)
      const next = {
        ...drag.startRect,
        w: drag.startRect.w + (e.clientX - drag.startX),
        h: drag.startRect.h + (e.clientY - drag.startY),
      };
      setDesktopAvatarPipRect(clampPipRect(next));
    };

    const onUp = (e: PointerEvent) => {
      const drag = pipDragRef.current;
      if (!drag) return;
      if (e.pointerId !== drag.pointerId) return;
      pipDragRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clampPipRect]);

  useEffect(() => {
    if (!isElectron) return;
    const onUpdated = (_ev: Event) => {
      setDesktopAvatarAvailRev((n) => n + 1);
    };
    window.addEventListener("touhou-desktop:vrm-updated", onUpdated as EventListener);
    return () => {
      window.removeEventListener("touhou-desktop:vrm-updated", onUpdated as EventListener);
    };
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron) {
      setDesktopAvatarAvailable(false);
      return;
    }
    if (!activeCharacterId) {
      setDesktopAvatarAvailable(false);
      return;
    }

    let canceled = false;
    (async () => {
      try {
        const res = await fetch(`/api/desktop/character-settings?char=${encodeURIComponent(activeCharacterId)}`, {
          cache: "no-store",
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; exists?: boolean; settings?: { vrm?: { enabled?: boolean; path?: string | null } } | null }
          | null;
        const ok = Boolean(res.ok && j?.ok && j.exists && j.settings?.vrm?.enabled && j.settings?.vrm?.path);
        if (!canceled) setDesktopAvatarAvailable(ok);
      } catch {
        if (!canceled) setDesktopAvatarAvailable(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [isElectron, activeCharacterId, desktopAvatarAvailRev]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* =========================
     Active character
  ========================= */

  const activeCharacter = useMemo(() => {
    if (!activeCharacterId) return null;
    return CHARACTERS[activeCharacterId] ?? null;
  }, [activeCharacterId]);

  const [resolvedChatBackground, setResolvedChatBackground] = useState<string | null>(null);

  useEffect(() => {
    const ui = activeCharacter?.ui;
    if (!ui) {
      setResolvedChatBackground(null);
      return;
    }

    const pc = typeof ui.chatBackgroundPC === "string" ? ui.chatBackgroundPC.trim() : "";
    const sp = typeof ui.chatBackgroundSP === "string" ? ui.chatBackgroundSP.trim() : "";
    const legacy = typeof ui.chatBackground === "string" ? ui.chatBackground.trim() : "";

    const preferred = isMobile ? sp || pc : pc || sp;
    const fallback = legacy || null;

    // Always show fallback immediately to avoid a "blank" background while checking preferred existence.
    setResolvedChatBackground(fallback);

    // If no preferred is configured, just use legacy (if any).
    if (!preferred) {
      return;
    }

    // Try to load preferred. If it 404s (image not yet added), fall back to legacy.
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setResolvedChatBackground(preferred);
    };
    img.onerror = () => {
      if (cancelled) return;
      setResolvedChatBackground(fallback);
    };
    img.src = preferred;

    return () => {
      cancelled = true;
    };
  }, [activeCharacterId, activeCharacter?.ui, isMobile]);

  /* =========================
     Character filter
  ========================= */

  const visibleCharacters = useMemo(() => {
    return Object.values(CHARACTERS).filter(
      (c) => isCharacterSelectable(c),
    );
  }, []);

  /* =========================
     Group Context
  ========================= */

  const panelGroupContext = useMemo<PanelGroupContext | null>(() => {
    if (!currentLayer || !currentLocationId) return null;
    const groups = getGroupsByLocation(currentLayer, currentLocationId);
    if (!groups.length) return null;
    const group = groups[0];
    if (!canEnableGroup(group.id)) return null;
    return { enabled: true, label: group.ui.label, group };
  }, [currentLayer, currentLocationId]);

  const chatGroupContext = useMemo<ChatGroupContext | null>(() => {
    if (!panelGroupContext?.enabled) return null;

    const participants = panelGroupContext.group.participants
      .map((id) => CHARACTERS[id])
      .filter((c) => isCharacterSelectable(c));

    const groupUi = panelGroupContext.group.ui as {
      chatBackground?: string | null;
      accent?: string;
    };

    return {
      enabled: true,
      label: panelGroupContext.group.ui.label,
      ui: {
        chatBackground: groupUi.chatBackground ?? undefined,
        accent: groupUi.accent,
      },
      participants,
    };
  }, [panelGroupContext]);

  /* =========================
     Initial session list
  ========================= */

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/session", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: SessionSummary[] };
      setSessions(data.sessions ?? []);
      setSessionsLoaded(true); // セッション一覧の取得完了
    })();
  }, []);

  /* =========================
     Character select
  ========================= */

  const selectCharacter = useCallback(
    async (characterId: string) => {
      const existing = sessions.find(
        (s) =>
          s.characterId === characterId &&
          (currentLayer ? s.layer === currentLayer : true) &&
          (currentLocationId ? s.location === currentLocationId : true),
      );
      if (existing) {
        setActiveSessionId(existing.id);
        setActiveCharacterId(characterId); // 既存セッションに切り替え
        setHasSelectedOnce(true);
        setIsPanelOpen(false);
        return;
      }

      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          mode,
          layer: currentLayer,
          location: currentLocationId,
          chatMode: getDefaultChatMode(),
        }),
      });

      if (!res.ok) return;
      const data = (await res.json()) as CreateSessionResponse;

      const newSession: SessionSummary = {
        id: data.sessionId,
        title: "新しい会話",
        characterId,
        mode,
        layer: currentLayer,
        location: currentLocationId,
        chatMode: getDefaultChatMode(),
      };

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setActiveCharacterId(characterId);
      setMessagesBySession((prev) => ({ ...prev, [newSession.id]: [] }));
      setHasSelectedOnce(true);
      setIsPanelOpen(false);
    },
    [sessions, mode, currentLayer, currentLocationId],
  );

  const createSession = useCallback(async () => {
    if (!activeCharacterId) return;

    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characterId: activeCharacterId,
        mode,
        layer: currentLayer,
        location: currentLocationId,
        chatMode: getDefaultChatMode(),
      }),
    });

    if (!res.ok) return;
    const data = (await res.json()) as CreateSessionResponse;

    const newSession: SessionSummary = {
      id: data.sessionId,
      title: "新しい会話",
      characterId: activeCharacterId,
      mode,
      layer: currentLayer,
      location: currentLocationId,
      chatMode: getDefaultChatMode(),
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setMessagesBySession((prev) => ({ ...prev, [newSession.id]: [] }));
    setHasSelectedOnce(true);
  }, [activeCharacterId, mode, currentLayer, currentLocationId]);

  /* =========================
     Artifact import / export
  ========================= */

  const handleExportActiveSession = useCallback(() => {
    if (!activeSessionId) return;

    const list = messagesBySession[activeSessionId] ?? [];
    const jsonl = buildRunJsonlFromMessages({
      sessionId: activeSessionId,
      messages: list.map((m) => ({ role: m.role, content: m.content })),
    });

    if (!jsonl.trim()) {
      alert("エクスポートできるメッセージがありません。");
      return;
    }

    const blob = new Blob([jsonl], { type: "application/x-ndjson" });
    const dlUrl = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = "run.jsonl";
      a.click();
    } finally {
      URL.revokeObjectURL(dlUrl);
    }
  }, [activeSessionId, messagesBySession]);

  const handleImportArtifactFile = useCallback(
    async (file: File) => {
      if (!activeCharacterId) {
        alert("先にキャラを選択してください。");
        return;
      }

      const MAX_BYTES = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX_BYTES) {
        alert("ファイルが大きすぎます（最大10MB）。");
        return;
      }

      setArtifactBusy(true);
      try {
        const text = await file.text();
        const parsed = parseArtifactText(text);

        if (!parsed.sessions || parsed.sessions.length === 0) {
          alert("復元できるデータが見つかりませんでした。");
          return;
        }

        const importChatMode = getDefaultChatMode();
        const payloadSessions = parsed.sessions.map((s) => ({
          title: s.title,
          externalSessionId: s.externalSessionId,
          messages: s.messages.map((m) => ({
            role: m.role,
            content: m.content,
            meta: m.meta ?? null,
          })),
        }));

        const res = await fetch("/api/session/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: activeCharacterId,
            mode,
            layer: currentLayer,
            location: currentLocationId,
            chatMode: importChatMode,
            sessions: payloadSessions,
          }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${detail}`);
        }

        const data = (await res.json()) as {
          sessions?: Array<{
            sessionId: string;
            title: string;
            externalSessionId?: string;
          }>;
        };

        const created = Array.isArray(data.sessions) ? data.sessions : [];
        if (created.length === 0) {
          alert("復元に失敗しました（有効なセッションがありません）。");
          return;
        }

        const externalToSource = new Map<string, (typeof parsed.sessions)[number]>();
        for (const s of parsed.sessions) {
          if (typeof s.externalSessionId === "string" && s.externalSessionId) {
            externalToSource.set(s.externalSessionId, s);
          }
        }

        const newSessions: SessionSummary[] = created.map((s) => ({
          id: s.sessionId,
          title: s.title,
          characterId: activeCharacterId,
          mode,
          layer: currentLayer,
          location: currentLocationId,
          chatMode: importChatMode,
        }));

        setSessions((prev) => [...newSessions, ...prev]);

        setMessagesBySession((prev) => {
          const next = { ...prev };
          for (let i = 0; i < created.length; i++) {
            const createdSession = created[i];
            const source =
              (createdSession.externalSessionId
                ? externalToSource.get(createdSession.externalSessionId)
                : null) ??
              parsed.sessions[i] ??
              null;

            const msgs = (source?.messages ?? []).map((m) => ({
              id: crypto.randomUUID(),
              role: m.role,
              content: m.content,
              speakerId: m.role === "ai" ? activeCharacterId : undefined,
              attachments: [],
              meta: m.meta ?? null,
            })) satisfies Message[];

            next[createdSession.sessionId] = msgs;
          }
          return next;
        });

        setActiveSessionId(created[0].sessionId);
        setHasSelectedOnce(true);
        setSidebarCloseRequestId((v) => v + 1);
      } catch (e: any) {
        const msg = typeof e?.message === "string" ? e.message : String(e);
        alert("インポートに失敗しました。\n" + msg);
      } finally {
        setArtifactBusy(false);
      }
    },
    [activeCharacterId, currentLayer, currentLocationId, mode],
  );

  /* =========================
   Reset auto select flag when URL char changes
========================= */
  useEffect(() => {
    autoSelectDoneRef.current = false;
  }, [searchParams.get("char")]);
  /* =========================
   Auto select character from URL (map → chat)
 ========================= */
  useEffect(() => {
    if (!sessionsLoaded) return;
    if (autoSelectDoneRef.current) return;

    const charFromUrl = searchParams.get("char");
    if (!charFromUrl) return;
    if (!CHARACTERS[charFromUrl]) return;

    autoSelectDoneRef.current = true;

    // URLの変更直後は状態が競合しやすいので、次のtickで selectCharacter を実行する
    Promise.resolve().then(() => {
      selectCharacter(charFromUrl);
    });
  }, [searchParams, sessionsLoaded, selectCharacter]);
  /* =========================
     Session select / delete / rename
  ========================= */

  const selectSession = useCallback(
    (sessionId: string) => {
      const s = sessions.find((x) => x.id === sessionId);
      if (!s) return;
      setActiveSessionId(s.id);
      setActiveCharacterId(s.characterId);
      setHasSelectedOnce(true);
      if (isMobile) setSidebarCloseRequestId((v) => v + 1);
    },
    [sessions, isMobile],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/session/${id}`, { method: "DELETE" });
      if (!res.ok) return;

      setSessions((prev) => prev.filter((s) => s.id !== id));
      setMessagesBySession((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (activeSessionId === id) {
        setActiveSessionId(null);
        setActiveCharacterId(null);
        setHasSelectedOnce(false);
        setIsPanelOpen(false);
      }
    },
    [activeSessionId],
  );

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    const t = title.trim();
    if (!t) return;

    const res = await fetch(`/api/session/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    });

    if (!res.ok) return;

    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: t } : s)),
    );
  }, []);

  /* =========================
     Messages restore
  ========================= */

  useEffect(() => {
    if (!activeSessionId) return;
    if (!sessions.some((s) => s.id === activeSessionId)) return;
    if (Object.prototype.hasOwnProperty.call(messagesBySession, activeSessionId))
      return;

    (async () => {
      const res = await fetch(`/api/session/${activeSessionId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessagesBySession((prev) => ({
        ...prev,
        [activeSessionId]:
          (Array.isArray(data.messages) ? data.messages : []).map((m: any) => ({
            id: String(m.id),
            role: m.role === "user" ? "user" : "ai",
            content: String(m.content ?? ""),
            speakerId:
              typeof m.speaker_id === "string" && m.speaker_id
                ? m.speaker_id
                : undefined,
            attachments: [],
            meta: (m.meta ?? null) as Record<string, unknown> | null,
          })) ?? [],
      }));
    })();
  }, [activeSessionId, sessions, messagesBySession]);

  /* =========================
     Message send
  ========================= */

  const handleSendTalk = useCallback(
    async (payload: {
      text: string;
      files: File[];
      attachments?: CompleteAttachment[];
    }) => {
      if (!activeSessionId || !activeCharacterId) return;

      const { text, files, attachments } = payload;
      const trimmed = String(text ?? "").trim();

      // Slash commands (client-side). Do NOT send to Persona core.
      // - /dump: export logs for the current session (admin-only, enforced server-side)
      if (/^\/dump\b/i.test(trimmed)) {
        appendMessage({
          id: crypto.randomUUID(),
          role: "user",
          content: trimmed,
          attachments: attachments ?? [],
          meta: null,
        });

        const aiId = crypto.randomUUID();
        appendMessage({
          id: aiId,
          role: "ai",
          content: "ログを生成中…",
          speakerId: activeCharacterId,
          attachments: [],
          meta: null,
        });

        try {
          const url = new URL("/api/logs/export", window.location.origin);
          url.searchParams.set("session_id", activeSessionId);
          url.searchParams.set("limit", "2000");

          const r = await fetch(url.toString(), { cache: "no-store" });
          if (!r.ok) {
            const detail = await r.text().catch(() => "");
            throw new Error(`export failed: HTTP ${r.status} ${detail}`);
          }

          const data = (await r.json()) as unknown;
          const ts = new Date().toISOString().replaceAll(":", "-");
          const filename = `touhou-logs_session_${activeSessionId}_${ts}.json`;

          const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          });
          const dlUrl = URL.createObjectURL(blob);
          try {
            const a = document.createElement("a");
            a.href = dlUrl;
            a.download = filename;
            a.click();
          } finally {
            URL.revokeObjectURL(dlUrl);
          }

          setMessagesBySession((prev) => {
            const list = prev[activeSessionId] ?? [];
            return {
              ...prev,
              [activeSessionId]: list.map((m) =>
                m.id === aiId
                  ? {
                      ...m,
                      content: `ログをダウンロードしました: ${filename}`,
                    }
                  : m
              ),
            };
          });
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          setMessagesBySession((prev) => {
            const list = prev[activeSessionId] ?? [];
            return {
              ...prev,
              [activeSessionId]: list.map((m) =>
                m.id === aiId
                  ? {
                      ...m,
                      content:
                        "ログのダンプに失敗しました。権限（管理者）またはサーバ設定を確認してください。\n" +
                        msg,
                    }
                  : m
              ),
            };
          });
        }

        return;
      }

      setIsRunningBySession((prev) => ({
        ...prev,
        [activeSessionId]: true,
      }));

      let aiId = "";
      try {
        // user message
        appendMessage({
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          attachments: attachments ?? [],
          meta: null,
        });

        // talk endpoint
        const endpoint = `/api/session/${activeSessionId}/message`;

        // talk: FormData に files を詰める
        const form = new FormData();
        form.append("characterId", activeCharacterId);
        form.append("text", text);

        for (const file of files) {
          form.append("files", file);
        }

        // AI placeholder (stream target)
        aiId = crypto.randomUUID();
        appendMessage({
          id: aiId,
          role: "ai",
          content: "...",
          speakerId: activeCharacterId,
          attachments: [],
          meta: null,
        });

        const appendDelta = (delta: string) => {
          if (!delta) return;
          setMessagesBySession((prev) => {
            const list = prev[activeSessionId] ?? [];
            return {
              ...prev,
              [activeSessionId]: list.map((m) => {
                if (m.id !== aiId) return m;
                const prevText = typeof m.content === "string" ? m.content : "";
                const base = prevText === "..." ? "" : prevText;
                return { ...m, content: base + delta };
              }),
            };
          });
        };

        const finalize = (finalText: string, meta: unknown) => {
          setMessagesBySession((prev) => {
            const list = prev[activeSessionId] ?? [];
            return {
              ...prev,
              [activeSessionId]: list.map((m) =>
                m.id === aiId
                  ? {
                      ...m,
                      content: finalText,
                      meta:
                        meta && typeof meta === "object" && !Array.isArray(meta)
                          ? (meta as Record<string, unknown>)
                          : null,
                    }
                  : m,
              ),
            };
          });
        };

        const res = await fetch(`${endpoint}?stream=1`, {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
          },
          body: form,
        });

        if (!res.ok || !res.body) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = (await res.json().catch(() => null)) as
              | { error?: unknown; detail?: unknown }
              | null;
            const msg = String(body?.error ?? body?.detail ?? "").trim();
            if (msg) detail = msg;
          } catch {
            // ignore
          }
          finalize(`（応答エラー: ${detail}）`, {
            status: res.status,
            source: "chat_stream_request",
          });
          return;
        }

        const reader = res.body.getReader();

        // ai message
        const decoder = new TextDecoder();
        let buf = "";
        let doneReceived = false;

        while (!doneReceived) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          while (true) {
            const idx = buf.indexOf("\n\n");
            if (idx === -1) break;
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (!block.trim()) continue;

            const lines = block.split("\n");
            let event = "message";
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:"))
                dataLines.push(line.slice(5).trim());
            }
            const dataRaw = dataLines.join("\n");

            if (event === "delta") {
              try {
                const parsed = JSON.parse(dataRaw);
                appendDelta(typeof parsed?.text === "string" ? parsed.text : "");
              } catch {
                appendDelta(dataRaw);
              }
            } else if (event === "done") {
              try {
                const parsed = JSON.parse(dataRaw);
                const reply =
                  typeof parsed?.reply === "string"
                    ? parsed.reply
                    : typeof parsed?.content === "string"
                      ? parsed.content
                      : "";
                const meta = parsed?.meta ?? null;
                finalize(
                  reply && reply.trim().length > 0
                    ? reply
                    : "（応答生成が一時的に利用できません。）",
                  meta,
                );
              } catch {
                finalize("（応答生成が一時的に利用できません。）", null);
              }
              doneReceived = true;
              break;
            } else if (event === "error") {
              console.warn("[talk stream error]", dataRaw);
            }
          }
        }
      } catch (e) {
        const message =
          e instanceof Error && e.message.trim()
            ? e.message.trim()
            : "stream transport failed";
        setMessagesBySession((prev) => {
          const list = prev[activeSessionId] ?? [];
          return {
            ...prev,
            [activeSessionId]: list.map((m) =>
              aiId && m.id === aiId
                ? {
                    ...m,
                    content: `（接続エラー: ${message}）`,
                    meta: { source: "chat_stream_transport" },
                  }
                : m,
            ),
          };
        });
      } finally {
        setIsRunningBySession((prev) => ({
          ...prev,
          [activeSessionId]: false,
        }));
      }
    },
    [
      activeSessionId,
      activeCharacterId,
      appendMessage,
      setMessagesBySession,
    ],
  );

  /* =========================
     Render
  ========================= */

  const activeMessages =
    activeSessionId != null ? (messagesBySession[activeSessionId] ?? []) : [];

  const attachmentAdapter = useMemo(() => new TouhouUploadAttachmentAdapter(), []);

  const store = useMemo<ExternalStoreAdapter<Message>>(
    () => ({
      isDisabled: !activeSessionId || !activeCharacterId,
      isRunning:
        !!activeSessionId && (isRunningBySession[activeSessionId] ?? false),
      isLoading: false,
      messages: activeMessages,
      convertMessage: (m) => talkMessageToThreadMessageLike(m),
      setMessages: undefined,
      onNew: async (message: AppendMessage) => {
        if (!activeSessionId || !activeCharacterId) return;
        if (message.role !== "user") return;

        const text = extractTextFromThreadMessageContent(message.content);
        const auiAttachments = (message.attachments ??
          []) as unknown as CompleteAttachment[];
        const files = auiAttachments
          .map((a) => a.file)
          .filter(Boolean) as File[];

        await handleSendTalk({ text, files, attachments: auiAttachments });
      },
      adapters: {
        attachments: attachmentAdapter,
        threadList: {
          threadId: activeSessionId ?? undefined,
          isLoading: !sessionsLoaded,
          threads: sessions.map((s) => ({
            status: "regular",
            id: s.id,
            remoteId: s.id,
            externalId: s.id,
            title: s.title,
          })),
          archivedThreads: [],
          onSwitchToNewThread: async () => {
            await createSession();
          },
          onSwitchToThread: async (threadId: string) => {
            selectSession(threadId);
          },
          onRename: async (threadId: string, newTitle: string) => {
            await handleRenameSession(threadId, newTitle);
          },
          onDelete: async (threadId: string) => {
            await handleDeleteSession(threadId);
          },
          onArchive: undefined,
          onUnarchive: undefined,
        },
      },
      unstable_capabilities: { copy: true },
      onEdit: undefined,
      onReload: undefined,
      onResume: undefined,
      onCancel: undefined,
    }),
    [
      activeCharacterId,
      activeMessages,
      activeSessionId,
      attachmentAdapter,
      createSession,
      handleDeleteSession,
      handleRenameSession,
      handleSendTalk,
      isRunningBySession,
      selectSession,
      sessions,
      sessionsLoaded,
    ],
  );

  const runtime = useExternalStoreRuntime(store);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport ?? null;

    const update = () => {
      const height = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      const bottomOcclusion = Math.max(
        0,
        window.innerHeight - (offsetTop + height),
      );
      root.style.setProperty("--app-vvh", `${height}px`);
      root.style.setProperty("--app-vvo", `${offsetTop}px`);
      root.style.setProperty("--app-vvb", `${bottomOcclusion}px`);
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    if (!mq.matches) return;

    const root = document.documentElement;
    const vv = window.visualViewport ?? null;

    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevWidth = document.body.style.width;
    const prevHeight = document.body.style.height;
    const prevTop = document.body.style.top;
    const prevRootOverflow = root.style.overflow;
    const prevRootHeight = root.style.height;
    const prevOverscroll = root.style.overscrollBehaviorY;

    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    document.body.style.top = `-${scrollY}px`;

    root.style.overflow = "hidden";
    root.style.height = "100%";
    root.style.overscrollBehaviorY = "none";

    const keepTop = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      if (root.scrollTop !== 0) root.scrollTop = 0;
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || t.isContentEditable) {
        setTimeout(keepTop, 0);
      }
    };

    keepTop();
    vv?.addEventListener("resize", keepTop);
    vv?.addEventListener("scroll", keepTop);
    window.addEventListener("scroll", keepTop, { passive: true });
    window.addEventListener("focusin", onFocusIn);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.width = prevWidth;
      document.body.style.height = prevHeight;
      document.body.style.top = prevTop;

      root.style.overflow = prevRootOverflow;
      root.style.height = prevRootHeight;
      root.style.overscrollBehaviorY = prevOverscroll;

      vv?.removeEventListener("resize", keepTop);
      vv?.removeEventListener("scroll", keepTop);
      window.removeEventListener("scroll", keepTop);
      window.removeEventListener("focusin", onFocusIn);

      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TouhouUiProvider
        value={{
          activeSessionId,
          sessions: sessions.map((s) => ({ id: s.id, characterId: s.characterId })),
          characters: CHARACTERS,
        }}
      >
        <SidebarProvider
          style={
            {
              "--sidebar-width": charactersCollapsed ? "19rem" : "32rem",
            } as React.CSSProperties
          }
        >
          <AutoCloseSidebarOnRequest requestId={sidebarCloseRequestId} />
          <div className="flex h-full w-full min-h-0 overflow-hidden bg-background text-foreground transition-colors duration-300">
            <TouhouSidebar
              visibleCharacters={visibleCharacters}
              activeCharacterId={activeCharacterId}
              onSelectCharacter={selectCharacter}
              activeSessionId={activeSessionId}
              onImportArtifactFile={handleImportArtifactFile}
              onExportActiveSession={handleExportActiveSession}
              artifactBusy={artifactBusy}
              charactersCollapsed={charactersCollapsed}
              onCharactersCollapsedChange={setCharactersCollapsed}
            />

            <SidebarInset className="relative flex min-h-0 flex-col overflow-hidden">
              {/* Background */}
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-70"
                style={{
                  backgroundImage: resolvedChatBackground
                    ? `url('${resolvedChatBackground}')`
                    : undefined,
                  filter: "blur(1px) brightness(0.9)",
                }}
              />

              {/* Header */}
              <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background/70 backdrop-blur">
                {activeCharacter?.color?.accent && (
                  <div
                    className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-60 ${activeCharacter.color.accent}`}
                  />
                )}

                <SidebarTrigger />
                <Separator orientation="vertical" className="mr-2 h-4" />
               <div className="min-w-0">
                 <div className="truncate font-gensou text-sm">
                   {activeCharacter?.name ?? "キャラを選択"}
                 </div>
                 <div className="truncate text-xs text-muted-foreground">
                   {activeSessionId ? "セッション: " + activeSessionId : "—"}
                 </div>
               </div>

                <ThreadSearch activeSessionId={activeSessionId} />

                {/* Desktop avatar controls (Electron only) */}
                {isElectron && activeSessionId ? (
                  <div className="ml-auto hidden items-center gap-2 lg:flex">
                    <button
                      type="button"
                      className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs text-foreground/80 hover:bg-background/60 disabled:opacity-40"
                      disabled={!desktopAvatarAvailable}
                      onClick={() => setDesktopAvatarVisible((v) => !v)}
                      title="Toggle avatar visibility"
                    >
                      {desktopAvatarVisible ? "Avatar: On" : "Avatar: Off"}
                    </button>

                    <button
                      type="button"
                      className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs text-foreground/80 hover:bg-background/60 disabled:opacity-40"
                      disabled={!desktopAvatarAvailable || !desktopAvatarVisible}
                      onClick={() =>
                        setDesktopAvatarLayout((v) => (v === "pip" ? "dock" : "pip"))
                      }
                      title="Switch avatar layout"
                    >
                      {desktopAvatarLayout === "pip" ? "Layout: PiP" : "Layout: Dock"}
                    </button>

                    <button
                      type="button"
                      className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs text-foreground/80 hover:bg-background/60 disabled:opacity-40"
                      disabled={!desktopAvatarAvailable || !desktopAvatarVisible || !activeCharacterId}
                      onClick={() => {
                        if (!activeCharacterId) return;
                        const url = `/desktop/avatar?char=${encodeURIComponent(activeCharacterId)}`;
                        try {
                          window.open(url, "touhou-avatar", "width=420,height=560");
                        } catch {
                          // ignore
                        }
                      }}
                      title="Open avatar window"
                    >
                      Pop out
                    </button>
                  </div>
                ) : null}
              </header>

              {/* Chat */}
              <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
                {activeSessionId ? (
                  <>
                    {isElectron && desktopAvatarVisible && desktopAvatarAvailable && desktopAvatarLayout === "dock" ? (
                      <div ref={dockWrapRef} className="flex h-full min-h-0 w-full">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <Thread />
                        </div>
                        <div
                          className="hidden h-full w-2 shrink-0 cursor-col-resize bg-transparent lg:block"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize avatar panel"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            dockDragRef.current = {
                              pointerId: e.pointerId,
                              startX: e.clientX,
                              startWidth: desktopAvatarDockWidth,
                            };
                            try {
                              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                            } catch {
                              // ignore
                            }
                          }}
                          onDoubleClick={() => setDesktopAvatarDockWidth(360)}
                          title="Drag to resize (double-click to reset)"
                        >
                          <div className="mx-auto h-full w-px bg-border/60" />
                        </div>
                        <aside
                          className="hidden h-full shrink-0 border-l border-border/60 bg-background/20 backdrop-blur lg:block"
                          style={{ width: `${desktopAvatarDockWidth}px` }}
                        >
                          <DesktopLiveAvatar
                            characterId={activeCharacterId}
                            className="h-full w-full"
                          />
                        </aside>
                      </div>
                    ) : (
                      <>
                        <Thread />
                        {isElectron && desktopAvatarVisible && desktopAvatarAvailable ? (
                          <div ref={pipWrapRef} className="absolute inset-0 pointer-events-none">
                            <div
                              className="pointer-events-auto absolute hidden overflow-hidden rounded-2xl border bg-background/30 shadow-xl backdrop-blur lg:block"
                              style={{
                                left: `${desktopAvatarPipRect.x}px`,
                                top: `${desktopAvatarPipRect.y}px`,
                                width: `${desktopAvatarPipRect.w}px`,
                                height: `${desktopAvatarPipRect.h}px`,
                              }}
                            >
                              <div
                                className="flex h-8 w-full items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-2 text-xs text-foreground/80"
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return;
                                  pipDragRef.current = {
                                    kind: "move",
                                    pointerId: e.pointerId,
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    startRect: desktopAvatarPipRect,
                                  };
                                  try {
                                    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                                  } catch {
                                    // ignore
                                  }
                                }}
                                onDoubleClick={() => {
                                  setDesktopAvatarPipRect((prev) =>
                                    clampPipRect({
                                      ...prev,
                                      w: 340,
                                      h: 420,
                                    }),
                                  );
                                }}
                                title="Drag to move (double-click to reset size)"
                              >
                                <div className="min-w-0 truncate">
                                  {activeCharacter?.name ?? "Avatar"}
                                </div>
                                <button
                                  type="button"
                                  className="rounded-md px-1.5 py-0.5 text-foreground/70 hover:bg-background/50"
                                  onClick={() => setDesktopAvatarVisible(false)}
                                  title="Hide avatar"
                                >
                                  ×
                                </button>
                              </div>

                              <DesktopLiveAvatar
                                characterId={activeCharacterId}
                                className="h-[calc(100%-2rem)] w-full"
                              />

                              <div
                                className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-sm border border-border/60 bg-background/50"
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return;
                                  pipDragRef.current = {
                                    kind: "resize",
                                    pointerId: e.pointerId,
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    startRect: desktopAvatarPipRect,
                                  };
                                  try {
                                    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                                  } catch {
                                    // ignore
                                  }
                                }}
                                title="Drag to resize"
                              />
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    左のサイドバーからキャラを選択してください
                  </div>
                )}
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </TouhouUiProvider>
    </AssistantRuntimeProvider>
  );
}

