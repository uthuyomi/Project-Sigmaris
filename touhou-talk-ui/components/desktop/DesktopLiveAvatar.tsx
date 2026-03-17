"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import VrmStage from "@/components/vrm/VrmStage";
import { useAquesTalkAudioTts } from "@/hooks/useAquesTalkAudioTts";

type ThreadMessageContent = unknown;

function extractTextFromContent(content: ThreadMessageContent): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  // assistant-ui message content is usually: [{ type: "text", text: "..." }, ...]
  const parts = Array.isArray(content) ? (content as any[]) : [];
  return parts
    .map((p) => (p && typeof p === "object" && (p as any).type === "text" ? String((p as any).text ?? "") : ""))
    .join("")
    .trim();
}

function stripForTts(raw: string): string {
  let s = String(raw ?? "");
  // Remove fenced code blocks (including ```vrm directives already stripped elsewhere).
  s = s.replace(/```[\s\S]*?```/g, " ");
  // Inline code
  s = s.replace(/`[^`]*`/g, " ");
  // Links: [text](url) -> text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Headings / bullets -> spaces
  s = s.replace(/^[#>*-]\s+/gm, "");
  s = s.replace(/\s+/g, " ").trim();
  // Keep it reasonable for synth backends.
  if (s.length > 700) s = s.slice(0, 700).trim();
  return s;
}

function isElectronUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return String(navigator.userAgent ?? "").includes("Electron");
}

function isAvatarPopoutWindow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (String(window.name ?? "") === "touhou-avatar") return true;
  } catch {}
  try {
    return String(window.location?.pathname ?? "") === "/desktop/avatar";
  } catch {
    return false;
  }
}

const POPOUT_HEARTBEAT_KEY = "touhou.desktop.avatar.popout.heartbeatUntil";

type DesktopCharacterSettings = {
  tts?: {
    mode?: "none" | "browser" | "aquestalk";
    aquestalk?: { enabled?: boolean };
  };
};

export default function DesktopLiveAvatar({
  characterId,
  className,
}: {
  characterId: string | null;
  className?: string;
}) {
  const enabled = useMemo(() => isElectronUa(), []);
  const isPopout = useMemo(() => isAvatarPopoutWindow(), []);
  const aques = useAquesTalkAudioTts();
  const [browserSpeaking, setBrowserSpeaking] = useState(false);
  const [vrmConfigured, setVrmConfigured] = useState(false);
  const [popoutActive, setPopoutActive] = useState(false);

  const stopAll = () => {
    try {
      aques.cancel();
    } catch {
      // ignore
    }
    try {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
      synth?.cancel?.();
    } catch {
      // ignore
    }
    setBrowserSpeaking(false);
  };

  const speak = async (text: string) => {
    if (!characterId) return;
    const t = stripForTts(text);
    if (!t) return;

    stopAll();

    // Query desktop settings (to decide mode). If this fails, just skip TTS.
    let mode: "none" | "browser" | "aquestalk" = "none";
    let aqEnabled = false;
    try {
      const res = await fetch(`/api/desktop/character-settings?char=${encodeURIComponent(characterId)}`, {
        cache: "no-store",
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; exists?: boolean; settings?: DesktopCharacterSettings | null; error?: string }
        | null;
      if (res.ok && j?.ok && j.exists && j.settings) {
        mode = (j.settings.tts?.mode as any) ?? "none";
        aqEnabled = !!j.settings.tts?.aquestalk?.enabled;
      }
    } catch {
      mode = "none";
    }

    if (mode === "browser") {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
      const Utterance = typeof window !== "undefined" ? window.SpeechSynthesisUtterance : null;
      if (!synth || !Utterance) return;
      try {
        synth.cancel();
        const u = new Utterance(t);
        u.lang = "ja-JP";
        u.onstart = () => setBrowserSpeaking(true);
        u.onend = () => setBrowserSpeaking(false);
        u.onerror = () => setBrowserSpeaking(false);
        synth.speak(u);
      } catch {
        setBrowserSpeaking(false);
      }
      return;
    }

    if (mode !== "aquestalk" || !aqEnabled) return;

    // AquesTalk: drive both audio-level and viseme weights (koe) to MotionManager.
    // Note: we do NOT pass speed/voice here, so the server can pull them from per-character settings via `?char=`.
    try {
      await aques.unlockAudio(); // best-effort (may still require user gesture)
    } catch {
      // ignore
    }
    await aques.speak({ text: t, characterId });
  };

  const [vrmRev, setVrmRev] = useState<string>("");

  const thread = useAuiState((s) => s.thread);
  const messages = thread.messages;
  const isRunning = thread.isRunning;

  const lastSpokenIdRef = useRef<string | null>(null);
  const prevRunningRef = useRef<boolean>(false);

  // Heartbeat so the main window can detect an active popout and avoid double-speaking.
  useEffect(() => {
    if (!enabled) return;
    if (!characterId) return;

    // In the popout window we publish a short-lived heartbeat.
    if (isPopout) {
      const tick = () => {
        try {
          window.localStorage.setItem(POPOUT_HEARTBEAT_KEY, String(Date.now() + 2500));
        } catch {
          // ignore
        }
      };

      tick();
      const id = window.setInterval(tick, 1000);
      return () => {
        window.clearInterval(id);
        try {
          window.localStorage.removeItem(POPOUT_HEARTBEAT_KEY);
        } catch {
          // ignore
        }
      };
    }

    // In the main window we observe the heartbeat.
    const read = () => {
      try {
        const raw = String(window.localStorage.getItem(POPOUT_HEARTBEAT_KEY) ?? "").trim();
        const until = Number(raw);
        const ok = Number.isFinite(until) && until > Date.now();
        setPopoutActive(ok);
      } catch {
        setPopoutActive(false);
      }
    };

    read();
    const poll = window.setInterval(read, 1000);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== POPOUT_HEARTBEAT_KEY) return;
      read();
    };
    try {
      window.addEventListener("storage", onStorage);
    } catch {
      // ignore
    }

    return () => {
      window.clearInterval(poll);
      try {
        window.removeEventListener("storage", onStorage);
      } catch {
        // ignore
      }
    };
  }, [enabled, isPopout, characterId]);

  useEffect(() => {
    // When switching character, stop any current audio to avoid cross-talk.
    stopAll();
    lastSpokenIdRef.current = null;
    setVrmRev("");
    setVrmConfigured(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  useEffect(() => {
    if (!enabled) return;
    if (!characterId) return;

    let canceled = false;
    (async () => {
      try {
        const res = await fetch(`/api/desktop/character-settings?char=${encodeURIComponent(characterId)}`, {
          cache: "no-store",
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; exists?: boolean; settings?: { vrm?: { enabled?: boolean; path?: string | null } } | null }
          | null;
        const ok = Boolean(res.ok && j?.ok && j.exists && j.settings?.vrm?.enabled && j.settings?.vrm?.path);
        if (!canceled) setVrmConfigured(ok);
      } catch {
        if (!canceled) setVrmConfigured(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [enabled, characterId, vrmRev]);

  useEffect(() => {
    if (!enabled) return;

    const onUpdated = (ev: Event) => {
      if (!characterId) return;
      const e = ev as CustomEvent<{ characterId?: unknown; rev?: unknown }>;
      const id = String(e?.detail?.characterId ?? "").trim();
      if (!id || id !== characterId) return;
      const rev = String(e?.detail?.rev ?? "").trim() || String(Date.now());
      setVrmRev(rev);
    };

    window.addEventListener("touhou-desktop:vrm-updated", onUpdated as EventListener);
    return () => {
      window.removeEventListener("touhou-desktop:vrm-updated", onUpdated as EventListener);
    };
  }, [enabled, characterId]);

  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = isRunning;
    if (!characterId) return;

    // If a popout is active, let it own TTS playback (avoid double-speaking).
    if (!isPopout && popoutActive) return;

    // Trigger on run end: the assistant message is now final.
    if (wasRunning && !isRunning) {
      const lastAssistant = [...messages].reverse().find((m: any) => (m as any)?.role === "assistant") as any;
      const id = String(lastAssistant?.id ?? "");
      if (!id || lastSpokenIdRef.current === id) return;
      lastSpokenIdRef.current = id;

      const rawText = extractTextFromContent(lastAssistant?.content);
      void speak(rawText);
    }
  }, [isRunning, messages, characterId, speak, isPopout, popoutActive]);

  // Popout-only: listen for "speak" events coming from the chat window.
  useEffect(() => {
    if (!enabled) return;
    if (!isPopout) return;
    if (!characterId) return;

    let bc: BroadcastChannel | null = null;

    const onSpeak = (payload: any) => {
      const id = String(payload?.messageId ?? "").trim() || null;
      const cid = String(payload?.characterId ?? "").trim();
      const text = String(payload?.text ?? "");
      if (!cid || cid !== characterId) return;
      if (!text.trim()) return;
      if (id && lastSpokenIdRef.current === id) return;
      if (id) lastSpokenIdRef.current = id;
      void speak(text);
    };

    const onCustom = (ev: Event) => {
      const e = ev as CustomEvent<any>;
      onSpeak(e?.detail ?? null);
    };

    try {
      window.addEventListener("touhou-desktop:tts-speak", onCustom as EventListener);
    } catch {
      // ignore
    }

    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel("touhou-desktop-tts");
        bc.onmessage = (e) => {
          const d = (e as MessageEvent<any>)?.data ?? null;
          if (d?.type !== "speak") return;
          onSpeak(d);
        };
      }
    } catch {
      bc = null;
    }

    return () => {
      try {
        window.removeEventListener("touhou-desktop:tts-speak", onCustom as EventListener);
      } catch {}
      try {
        bc?.close();
      } catch {}
    };
  }, [enabled, isPopout, characterId, speak]);

  if (!enabled || !characterId) return null;
  if (!vrmConfigured) return null;

  const url = `/api/vrm/${encodeURIComponent(characterId)}${vrmRev ? `?rev=${encodeURIComponent(vrmRev)}` : ""}`;
  // IMPORTANT:
  // "speaking" should reflect actual audio playback.
  // If TTS is disabled, we must NOT animate as if speaking just because a model run is in progress.
  const stageSpeaking = aques.speaking || browserSpeaking;
  const getLipSyncFrame = aques.getLipSyncFrame;

  return (
    <div className={className}>
      <VrmStage
        url={url}
        speaking={stageSpeaking}
        getLipSyncFrame={getLipSyncFrame}
        className="h-full w-full"
      />
    </div>
  );
}
