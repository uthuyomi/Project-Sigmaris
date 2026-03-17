"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type SpeakParams = {
  text: string;
  characterId?: string | null;
  speed?: number | null;
  voice?: string | null;
};

type SpeakResult = { ok: true } | { ok: false; reason: string };

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

type VisemeWeights = { wAa: number; wIh: number; wOu: number; wEe: number; wOh: number };
type Viseme = "aa" | "ih" | "ou" | "ee" | "oh";
type VisemeSegment = { t0Sec: number; t1Sec: number; v: Viseme };

export type TtsPlaybackInfo = {
  mode: "webaudio" | "htmlaudio" | "none";
  tSec: number;
  durationSec: number;
  progress01: number;
};

export function useAquesTalkAudioTts() {
  const supported = useMemo(() => typeof window !== "undefined" && typeof fetch === "function", []);

  const [speaking, setSpeaking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);

  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(0);

  const vowelTokensRef = useRef<Viseme[]>([]);
  const segmentsRef = useRef<VisemeSegment[] | null>(null);
  const playStartCtxTimeRef = useRef<number | null>(null);
  const playDurationRef = useRef<number>(0);
  const playModeRef = useRef<"webaudio" | "htmlaudio" | "none">("none");

  const ensureAudio = useCallback(() => {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return { ctx: null as AudioContext | null, analyser: null as AnalyserNode | null };

    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new Ctx();
      } catch {
        audioCtxRef.current = null;
      }
    }
    const ctx = audioCtxRef.current;
    if (!ctx) return { ctx: null, analyser: null };

    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.7;
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
    }

    return { ctx, analyser: analyserRef.current };
  }, []);

  const cleanupUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
    try {
      URL.revokeObjectURL(objectUrlRef.current);
    } catch {
      // ignore
    }
    objectUrlRef.current = null;
  }, []);

  const stopLevelRaf = useCallback(() => {
    if (rafRef.current == null) return;
    try {
      window.cancelAnimationFrame(rafRef.current);
    } catch {
      // ignore
    }
    rafRef.current = null;
  }, []);

  const startLevelRaf = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    if (rafRef.current != null) return;

    const buf = new Float32Array(analyser.fftSize);
    let smoothed = levelRef.current;

    const tick = () => {
      rafRef.current = window.requestAnimationFrame(tick);
      try {
        analyser.getFloatTimeDomainData(buf);
      } catch {
        return;
      }

      let sum = 0;
      for (let i = 0; i < buf.length; i += 1) {
        const v = buf[i] ?? 0;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length); // ~0..0.3 for speech
      const norm = clamp01((rms - 0.008) / 0.09);
      const a = norm > smoothed ? 0.42 : 0.14; // fast attack, slower release
      smoothed = smoothed + (norm - smoothed) * a;
      levelRef.current = smoothed;
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const cancel = useCallback(() => {
    const s = srcRef.current;
    if (s) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        // ignore
      }
    }
    srcRef.current = null;
    playModeRef.current = "none";
    playStartCtxTimeRef.current = null;
    playDurationRef.current = 0;
    vowelTokensRef.current = [];
    segmentsRef.current = null;
    levelRef.current = 0;
    setSpeaking(false);
    stopLevelRaf();

    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
        a.src = "";
      } catch {
        // ignore
      }
      a.onended = null;
      a.onerror = null;
      a.onpause = null;
      a.onplay = null;
    }
    cleanupUrl();
  }, [stopLevelRaf, cleanupUrl]);

  function extractVowelTokens(koe: string): Array<"aa" | "ih" | "ou" | "ee" | "oh"> {
    const s = String(koe ?? "");
    const out: Array<"aa" | "ih" | "ou" | "ee" | "oh"> = [];

    const pushVowel = (v: string) => {
      if (v === "a" || v === "ぁ" || v === "あ" || v === "ア") out.push("aa");
      else if (v === "i" || v === "ぃ" || v === "い" || v === "イ") out.push("ih");
      else if (v === "u" || v === "ぅ" || v === "う" || v === "ウ") out.push("ou");
      else if (v === "e" || v === "ぇ" || v === "え" || v === "エ") out.push("ee");
      else if (v === "o" || v === "ぉ" || v === "お" || v === "オ") out.push("oh");
    };

    // 1) roman vowels (most robust across AquesTalk notation variants)
    const lower = s.toLowerCase();
    for (let i = 0; i < lower.length; i += 1) {
      const ch = lower[i] ?? "";
      if ("aiueo".includes(ch)) pushVowel(ch);
    }

    // 2) kana vowels as fallback
    if (!out.length) {
      for (let i = 0; i < s.length; i += 1) {
        const ch = s[i] ?? "";
        if ("ぁあぃいぅうぇえぉおアイウエオ".includes(ch)) pushVowel(ch);
        else if (ch === "ー" && out.length) out.push(out[out.length - 1]!);
      }
    }

    return out;
  }

  function extractVowelTokensSafe(koe: string): Array<"aa" | "ih" | "ou" | "ee" | "oh"> {
    const s = String(koe ?? "");
    const out: Array<"aa" | "ih" | "ou" | "ee" | "oh"> = [];

    const push = (v: string) => {
      const ch = String(v ?? "");
      if (ch === "a") out.push("aa");
      else if (ch === "i") out.push("ih");
      else if (ch === "u") out.push("ou");
      else if (ch === "e") out.push("ee");
      else if (ch === "o") out.push("oh");
      else if (ch === "あ" || ch === "ぁ" || ch === "ア" || ch === "ァ") out.push("aa");
      else if (ch === "い" || ch === "ぃ" || ch === "イ" || ch === "ィ") out.push("ih");
      else if (ch === "う" || ch === "ぅ" || ch === "ウ" || ch === "ゥ") out.push("ou");
      else if (ch === "え" || ch === "ぇ" || ch === "エ" || ch === "ェ") out.push("ee");
      else if (ch === "お" || ch === "ぉ" || ch === "オ" || ch === "ォ") out.push("oh");
      else if (ch === "ー" && out.length) out.push(out[out.length - 1]!);
    };

    const lower = s.toLowerCase();
    for (let i = 0; i < lower.length; i += 1) {
      const ch = lower[i] ?? "";
      if ("aiueo".includes(ch)) push(ch);
    }

    if (!out.length) {
      for (let i = 0; i < s.length; i += 1) {
        const ch = s[i] ?? "";
        if ("あぁいぃうぅえぇおぉアイウエオァィゥェォー".includes(ch)) push(ch);
      }
    }

    return out;
  }

  function phonemeToViseme(raw: unknown): Viseme | null {
    const s = String(raw ?? "").trim();
    if (!s) return null;

    const lower = s.toLowerCase();
    // Prefer the last vowel-like char in the token.
    for (let i = lower.length - 1; i >= 0; i -= 1) {
      const ch = lower[i] ?? "";
      if (ch === "a") return "aa";
      if (ch === "i") return "ih";
      if (ch === "u") return "ou";
      if (ch === "e") return "ee";
      if (ch === "o") return "oh";
    }

    // Kana vowels (hiragana/katakana + small vowels)
    for (let i = s.length - 1; i >= 0; i -= 1) {
      const ch = s[i] ?? "";
      if ("あぁアァ".includes(ch)) return "aa";
      if ("いぃイィ".includes(ch)) return "ih";
      if ("うぅウゥ".includes(ch)) return "ou";
      if ("えぇエェ".includes(ch)) return "ee";
      if ("おぉオォ".includes(ch)) return "oh";
    }

    return null;
  }

  function normalizeTimeline(tl: unknown): VisemeSegment[] | null {
    if (!Array.isArray(tl) || tl.length < 1) return null;

    const segs: VisemeSegment[] = [];

    for (const item of tl) {
      if (!item || typeof item !== "object") continue;
      const o = item as any;

      const t0Raw = o.t0Sec ?? o.startSec ?? o.start ?? o.t0 ?? null;
      const t1Raw = o.t1Sec ?? o.endSec ?? o.end ?? o.t1 ?? null;
      const t0 = Number(t0Raw);
      const t1 = Number(t1Raw);
      if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
      if (t1 <= t0) continue;

      const v = (o.v as Viseme) ?? phonemeToViseme(o.viseme ?? o.phoneme ?? o.p);
      if (!v) continue;

      segs.push({ t0Sec: t0, t1Sec: t1, v });
    }

    if (segs.length < 1) return null;

    // Heuristic: if looks like milliseconds, convert to seconds.
    const maxT = Math.max(...segs.map((s) => s.t1Sec));
    if (maxT > 120) {
      for (const s of segs) {
        s.t0Sec = s.t0Sec / 1000;
        s.t1Sec = s.t1Sec / 1000;
      }
    }

    segs.sort((a, b) => a.t0Sec - b.t0Sec);
    return segs;
  }

  function buildSegmentsFromAudio(audioBuf: AudioBuffer, tokens: Viseme[]): VisemeSegment[] | null {
    if (!tokens.length) return null;
    if (!Number.isFinite(audioBuf.duration) || audioBuf.duration <= 0.05) return null;

    const sr = audioBuf.sampleRate || 48000;
    const ch0 = audioBuf.getChannelData(0);
    if (!ch0 || ch0.length < 128) return null;

    const frameSize = Math.max(256, Math.floor(sr * 0.01)); // ~10ms
    const hop = frameSize;
    const nFrames = Math.max(1, Math.floor(ch0.length / hop));
    const rms: number[] = new Array(nFrames);
    let max = 0;

    for (let fi = 0; fi < nFrames; fi += 1) {
      const off = fi * hop;
      let sum = 0;
      for (let i = 0; i < frameSize; i += 1) {
        const v = ch0[off + i] ?? 0;
        sum += v * v;
      }
      const r = Math.sqrt(sum / frameSize);
      rms[fi] = r;
      if (r > max) max = r;
    }

    if (max <= 1e-6) return null;

    // Smooth a little.
    for (let i = 1; i < rms.length - 1; i += 1) {
      rms[i] = (rms[i - 1]! + rms[i]! + rms[i + 1]!) / 3;
    }

    const thr = Math.max(0.004, max * 0.12);
    let startI = -1;
    let endI = -1;
    for (let i = 0; i < rms.length; i += 1) {
      if (rms[i]! >= thr) {
        startI = i;
        break;
      }
    }
    for (let i = rms.length - 1; i >= 0; i -= 1) {
      if (rms[i]! >= thr) {
        endI = i;
        break;
      }
    }
    if (startI < 0 || endI < 0 || endI <= startI) return null;

    const tStart = (startI * hop) / sr;
    const tEnd = Math.min(audioBuf.duration, ((endI + 1) * hop) / sr);
    const total = Math.max(0.05, tEnd - tStart);

    const boundaries: number[] = new Array(tokens.length + 1);
    boundaries[0] = tStart;
    boundaries[boundaries.length - 1] = tEnd;

    const searchWinSec = 0.12;
    const toFrame = (tSec: number) => Math.max(0, Math.min(rms.length - 1, Math.round((tSec * sr) / hop)));

    for (let bi = 1; bi < boundaries.length - 1; bi += 1) {
      const expected = tStart + (total * bi) / tokens.length;
      const loF = toFrame(expected - searchWinSec);
      const hiF = toFrame(expected + searchWinSec);
      let bestF = loF;
      let bestV = Number.POSITIVE_INFINITY;
      for (let f = loF; f <= hiF; f += 1) {
        const v = rms[f]!;
        if (v < bestV) {
          bestV = v;
          bestF = f;
        }
      }
      boundaries[bi] = (bestF * hop) / sr;
    }

    // Enforce monotonic boundaries with a small minimum duration.
    const minSeg = 0.03;
    for (let i = 1; i < boundaries.length; i += 1) {
      const prev = boundaries[i - 1]!;
      boundaries[i] = Math.max(prev + minSeg, boundaries[i]!);
    }
    boundaries[boundaries.length - 1] = Math.max(boundaries[boundaries.length - 1]!, boundaries[boundaries.length - 2]! + minSeg);

    const segs: VisemeSegment[] = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const t0 = boundaries[i]!;
      const t1 = boundaries[i + 1]!;
      if (t1 <= t0) continue;
      segs.push({ t0Sec: t0, t1Sec: t1, v: tokens[i]! });
    }

    return segs.length ? segs : null;
  }

  const unlockAudio = useCallback(async (): Promise<SpeakResult> => {
    if (!supported) return { ok: false, reason: "fetch is not supported" };
    setLastError(null);

    const { ctx } = ensureAudio();
    if (!ctx) return { ok: false, reason: "AudioContext is not available" };

    try {
      if (typeof ctx.resume === "function") await ctx.resume();
      // Play a tiny silent buffer once to satisfy stricter autoplay policies.
      try {
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
        src.stop(ctx.currentTime + 0.01);
      } catch {
        // ignore
      }
      setUnlocked(true);
      return { ok: true };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "AudioContext resume failed";
      setLastError(reason);
      return { ok: false, reason };
    }
  }, [supported, ensureAudio]);

  function estimateWavDurationSec(wavBytes: Uint8Array): number | null {
    try {
      // Minimal WAV header parse (RIFF/WAVE + fmt + data)
      if (wavBytes.length < 44) return null;
      const dv = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
      const riff = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
      const wave = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
      if (riff !== "RIFF" || wave !== "WAVE") return null;

      let offset = 12;
      let sampleRate = 0;
      let channels = 0;
      let bits = 0;
      let dataSize = 0;

      while (offset + 8 <= dv.byteLength) {
        const id = String.fromCharCode(
          dv.getUint8(offset),
          dv.getUint8(offset + 1),
          dv.getUint8(offset + 2),
          dv.getUint8(offset + 3),
        );
        const size = dv.getUint32(offset + 4, true);
        const body = offset + 8;
        if (id === "fmt " && size >= 16 && body + size <= dv.byteLength) {
          channels = dv.getUint16(body + 2, true);
          sampleRate = dv.getUint32(body + 4, true);
          bits = dv.getUint16(body + 14, true);
        } else if (id === "data" && body + size <= dv.byteLength) {
          dataSize = size;
          break;
        }
        offset = body + size + (size % 2);
      }

      if (!sampleRate || !channels || !bits || !dataSize) return null;
      const bytesPerSample = (bits / 8) * channels;
      if (!bytesPerSample) return null;
      const frames = dataSize / bytesPerSample;
      return frames / sampleRate;
    } catch {
      return null;
    }
  }

  const speak = useCallback(
    async (params: SpeakParams): Promise<SpeakResult> => {
      if (!supported) return { ok: false, reason: "fetch is not supported" };

      const text = String(params.text ?? "").trim();
      if (!text) return { ok: false, reason: "Empty text" };

      const characterId = String(params.characterId ?? "").trim();
      const hasSpeed = typeof params.speed === "number" && Number.isFinite(params.speed);
      const hasVoice = typeof params.voice === "string" && String(params.voice).trim() !== "";
      const speed = hasSpeed ? clampInt(Number(params.speed), 50, 300) : null;
      const voice = hasVoice ? String(params.voice).trim() : null;

      cancel();
      setLastError(null);

      const { ctx, analyser } = ensureAudio();
      if (!ctx || !analyser) return { ok: false, reason: "AudioContext/analyser not ready" };

      try {
        if (typeof ctx.resume === "function") await ctx.resume();
      } catch (e) {
        const reason = e instanceof Error ? e.message : "AudioContext resume failed";
        setLastError(reason);
        return { ok: false, reason };
      }

      let j: { b64?: unknown; koe?: unknown; timeline?: unknown; alignment?: unknown; labels?: unknown } | null = null;
      try {
        const url = `/api/tts/aquestalk1?format=json${characterId ? `&char=${encodeURIComponent(characterId)}` : ""}`;
        const body: Record<string, unknown> = { text };
        if (speed != null) body.speed = speed;
        if (voice != null) body.voice = voice;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const ej = await res.json().catch(() => null);
          return { ok: false, reason: String((ej as any)?.error ?? res.status) };
        }
        j = (await res.json().catch(() => null)) as any;
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "Fetch failed" };
      }

      const b64 = typeof j?.b64 === "string" ? j.b64 : null;
      const koe = typeof j?.koe === "string" ? j.koe : null;
      if (!b64) return { ok: false, reason: "Missing b64 audio" };

      let wavBytes: Uint8Array;
      try {
        const normB64 = b64
          .replace(/[\r\n\s]+/g, "")
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        const bin = atob(normB64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i) & 0xff;
        wavBytes = bytes;
      } catch (e) {
        const reason = e instanceof Error ? e.message : "Invalid b64 audio";
        setLastError(reason);
        return { ok: false, reason };
      }

      const tokens = koe ? extractVowelTokensSafe(koe) : [];
      vowelTokensRef.current = tokens;

      // Prefer explicit alignment labels from the TTS backend if present (e.g., VOICEVOX-style).
      const providedTimeline =
        normalizeTimeline((j as any)?.timeline ?? (j as any)?.alignment ?? (j as any)?.labels ?? null) ?? null;
      segmentsRef.current = providedTimeline;

      const ab = wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength);

      let audioBuf: AudioBuffer;
      try {
        audioBuf = await new Promise<AudioBuffer>((resolve, reject) => {
          const p = (ctx as any).decodeAudioData(ab, resolve, reject);
          if (p && typeof (p as Promise<AudioBuffer>).then === "function") {
            (p as Promise<AudioBuffer>).then(resolve, reject);
          }
        });
      } catch (e) {
        // Fallback: HTMLAudio playback (some environments fail decoding WAV).
        const a = audioRef.current ?? new Audio();
        audioRef.current = a;
        cleanupUrl();

        const blob = new Blob([wavBytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        a.src = url;
        a.preload = "auto";

        const dur = estimateWavDurationSec(wavBytes) ?? 0;
        playDurationRef.current = dur;
        playStartCtxTimeRef.current = null;
        playModeRef.current = "htmlaudio";

        a.onplay = () => {
          setSpeaking(true);
          startLevelRaf();
        };
        const end = () => {
          setSpeaking(false);
          levelRef.current = 0;
          vowelTokensRef.current = [];
          segmentsRef.current = null;
          stopLevelRaf();
          cleanupUrl();
        };
        a.onended = end;
        a.onerror = end;
        a.onpause = () => setSpeaking(false);

        try {
          await a.play();
        } catch (err) {
          const reason =
            err instanceof Error ? err.message : "HTMLAudio play failed (autoplay policy?)";
          setLastError(reason);
          return { ok: false, reason };
        }

        setUnlocked(true);
        return { ok: true };
      }

      // If the backend didn't provide alignment labels, derive a coarse timeline
      // by snapping expected vowel boundaries to local energy minima in the decoded audio.
      if (!segmentsRef.current && vowelTokensRef.current.length) {
        try {
          segmentsRef.current = buildSegmentsFromAudio(audioBuf, vowelTokensRef.current);
        } catch {
          segmentsRef.current = null;
        }
      }

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(analyser);

      playDurationRef.current = audioBuf.duration || 0;
      playStartCtxTimeRef.current = ctx.currentTime;
      playModeRef.current = "webaudio";

      src.onended = () => {
        srcRef.current = null;
        playStartCtxTimeRef.current = null;
        playDurationRef.current = 0;
        vowelTokensRef.current = [];
        segmentsRef.current = null;
        levelRef.current = 0;
        setSpeaking(false);
        stopLevelRaf();
      };

      srcRef.current = src;
      startLevelRaf();
      setSpeaking(true);

      try {
        src.start();
      } catch (e) {
        srcRef.current = null;
        setSpeaking(false);
        stopLevelRaf();
        const reason = e instanceof Error ? e.message : "AudioBufferSource start failed";
        setLastError(reason);
        return { ok: false, reason };
      }

      setUnlocked(true);
      return { ok: true };
    },
    [supported, cancel, ensureAudio, startLevelRaf, stopLevelRaf],
  );

  const getLipSyncLevel = useCallback(() => levelRef.current, []);

  const getPlaybackInfo = useCallback((): TtsPlaybackInfo => {
    const mode = playModeRef.current;
    const dur = Number.isFinite(playDurationRef.current) ? playDurationRef.current : 0;
    let t = 0;

    if (mode === "webaudio") {
      const ctx = audioCtxRef.current;
      const start = playStartCtxTimeRef.current;
      if (ctx && start != null && Number.isFinite(dur) && dur > 0.01) {
        t = Math.max(0, Math.min(dur, ctx.currentTime - start));
      }
    } else if (mode === "htmlaudio") {
      const a = audioRef.current;
      const ct = a ? a.currentTime : 0;
      if (Number.isFinite(dur) && dur > 0.01) {
        t = Math.max(0, Math.min(dur, ct));
      }
    }

    const p = dur > 0.01 ? clamp01(t / dur) : 0;
    return { mode, tSec: t, durationSec: dur, progress01: p };
  }, []);

  const getLipSyncFrame = useCallback((): { level: number; weights: null | VisemeWeights } => {
    const level = levelRef.current;
    const tokens = vowelTokensRef.current;
    const segs = segmentsRef.current;

    const ctx = audioCtxRef.current;
    const start = playStartCtxTimeRef.current;
    const dur = playDurationRef.current;
    if (!Number.isFinite(dur) || dur <= 0.01 || (tokens.length < 1 && !(segs && segs.length))) {
      return { level, weights: null };
    }

    let t = 0;
    if (playModeRef.current === "webaudio" && ctx && start != null) {
      t = Math.max(0, Math.min(dur, ctx.currentTime - start));
    } else if (playModeRef.current === "htmlaudio") {
      const a = audioRef.current;
      const ct = a ? a.currentTime : 0;
      t = Math.max(0, Math.min(dur, ct));
      // No analyser in fallback mode: approximate "level" by syllable phase.
      const ph = (dur > 0 ? t / dur : 0) * tokens.length;
      const frac = ph - Math.floor(ph);
      const approx = Math.pow(Math.sin(frac * Math.PI), 0.6);
      levelRef.current = clamp01(0.15 + 0.85 * approx);
    } else {
      return { level, weights: null };
    }

    if (segs && segs.length) {
      // Time-aligned viseme timeline (preferred when available).
      let idx = 0;
      while (idx < segs.length && t > segs[idx]!.t1Sec) idx += 1;
      if (idx >= segs.length) idx = segs.length - 1;
      if (idx < 0) idx = 0;

      const curSeg = segs[idx]!;
      const prevSeg = idx > 0 ? segs[idx - 1]! : null;
      const nextSeg = idx < segs.length - 1 ? segs[idx + 1]! : null;

      const xfade = 0.06; // seconds

      let wPrev = 0;
      let wCur = 1;
      let wNext = 0;

      if (prevSeg) {
        const a = clamp01(1 - (t - curSeg.t0Sec) / xfade);
        wPrev = a;
        wCur *= 1 - a;
      }
      if (nextSeg) {
        const a = clamp01(1 - (curSeg.t1Sec - t) / xfade);
        wNext = a;
        wCur *= 1 - a;
      }

      const sum = Math.max(1e-6, wPrev + wCur + wNext);
      wPrev /= sum;
      wCur /= sum;
      wNext /= sum;

      const base = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 } as Record<Viseme, number>;
      base[curSeg.v] += wCur;
      if (prevSeg) base[prevSeg.v] += wPrev;
      if (nextSeg) base[nextSeg.v] += wNext;

      return {
        level,
        weights: { wAa: base.aa, wIh: base.ih, wOu: base.ou, wEe: base.ee, wOh: base.oh },
      };
    }

    const x = (t / dur) * tokens.length;
    const i = Math.max(0, Math.min(tokens.length - 1, Math.floor(x)));
    const f = x - i;
    const cur = tokens[i]!;
    const nxt = tokens[Math.min(tokens.length - 1, i + 1)]!;

    const smoothstep = (u: number) => u * u * (3 - 2 * u);
    const blend = smoothstep(clamp01((f - 0.25) / 0.5));

    const base = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 } as Record<
      "aa" | "ih" | "ou" | "ee" | "oh",
      number
    >;
    base[cur] += 1 - blend;
    base[nxt] += blend;

    return { level, weights: { wAa: base.aa, wIh: base.ih, wOu: base.ou, wEe: base.ee, wOh: base.oh } };
  }, []);

  return {
    supported,
    speaking,
    unlocked,
    lastError,
    unlockAudio,
    speak,
    cancel,
    getLipSyncLevel,
    getPlaybackInfo,
    getLipSyncFrame,
  };
}
