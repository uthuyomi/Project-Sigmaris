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
  const aques = useAquesTalkAudioTts();
  const [browserSpeaking, setBrowserSpeaking] = useState(false);
  const [vrmConfigured, setVrmConfigured] = useState(false);

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

    // Trigger on run end: the assistant message is now final.
    if (wasRunning && !isRunning) {
      const lastAssistant = [...messages].reverse().find((m: any) => (m as any)?.role === "assistant") as any;
      const id = String(lastAssistant?.id ?? "");
      if (!id || lastSpokenIdRef.current === id) return;
      lastSpokenIdRef.current = id;

      const rawText = extractTextFromContent(lastAssistant?.content);
      void speak(rawText);
    }
  }, [isRunning, messages, characterId, speak]);

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
