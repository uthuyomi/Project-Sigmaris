"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import VrmStage from "@/components/vrm/VrmStage";

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

function useDesktopTts(characterId: string | null) {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const timeBufRef = useRef<Uint8Array | null>(null);

  const stop = () => {
    try {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = "";
      }
    } catch {
      // ignore
    }
    try {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    } catch {
      // ignore
    }
    urlRef.current = null;
    setSpeaking(false);
  };

  useEffect(() => {
    return () => {
      stop();
      try {
        ctxRef.current?.close();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getLipSyncFrame = useMemo(() => {
    return () => {
      const analyser = analyserRef.current;
      if (!analyser) return { level: 0, weights: null as any };

      const n = analyser.fftSize || 2048;
      if (!timeBufRef.current || timeBufRef.current.length !== n) {
        timeBufRef.current = new Uint8Array(n);
      }
      const buf = timeBufRef.current;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 1) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / Math.max(1, buf.length));
      // Mild compression & boost for easier lip sync.
      const level = Math.max(0, Math.min(1, Math.pow(rms * 2.2, 0.8)));
      return { level, weights: null };
    };
  }, []);

  const speak = async (text: string) => {
    if (!characterId) return;
    const t = stripForTts(text);
    if (!t) return;

    // Ensure audio graph exists (user gesture may be required; best-effort).
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;

      const ensureGraph = () => {
        if (typeof window === "undefined") return;
        if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        const ctx = ctxRef.current!;
        if (!analyserRef.current) {
          const an = ctx.createAnalyser();
          an.fftSize = 2048;
          an.smoothingTimeConstant = 0.65;
          analyserRef.current = an;
        }
        if (!mediaSourceRef.current) {
          mediaSourceRef.current = ctx.createMediaElementSource(audio);
          mediaSourceRef.current.connect(analyserRef.current!);
          analyserRef.current!.connect(ctx.destination);
        }
      };
      ensureGraph();
    } catch {
      // ignore (lip sync will just be silent)
    }

    stop();

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
        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        synth.speak(u);
      } catch {
        setSpeaking(false);
      }
      return;
    }

    if (mode !== "aquestalk" || !aqEnabled) return;

    try {
      setSpeaking(true);
      const res = await fetch(`/api/tts/aquestalk1?char=${encodeURIComponent(characterId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      if (!res.ok) {
        setSpeaking(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;

      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      audio.src = url;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);

      try {
        await ctxRef.current?.resume?.();
      } catch {
        // ignore
      }

      await audio.play();
    } catch {
      setSpeaking(false);
    }
  };

  return { speaking, getLipSyncFrame, speak, stop };
}

export default function DesktopLiveAvatar({
  characterId,
  className,
}: {
  characterId: string | null;
  className?: string;
}) {
  const enabled = useMemo(() => isElectronUa(), []);
  const { speaking, getLipSyncFrame, speak, stop } = useDesktopTts(characterId);

  const [vrmRev, setVrmRev] = useState<string>("");

  const thread = useAuiState((s) => s.thread);
  const messages = thread.messages;
  const isRunning = thread.isRunning;

  const lastSpokenIdRef = useRef<string | null>(null);
  const prevRunningRef = useRef<boolean>(false);

  useEffect(() => {
    // When switching character, stop any current audio to avoid cross-talk.
    stop();
    lastSpokenIdRef.current = null;
    setVrmRev("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

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

  const url = `/api/vrm/${encodeURIComponent(characterId)}${vrmRev ? `?rev=${encodeURIComponent(vrmRev)}` : ""}`;

  return (
    <div className={className}>
      <VrmStage
        url={url}
        speaking={speaking}
        getLipSyncFrame={getLipSyncFrame}
        className="h-full w-full"
      />
    </div>
  );
}
