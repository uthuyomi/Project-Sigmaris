import type { VRM } from "@pixiv/three-vrm";
import type { Object3D } from "three";
import { Euler, MathUtils, Quaternion as ThreeQuaternion } from "three";

type BoneName =
  | "head"
  | "neck"
  | "chest"
  | "spine"
  | "hips"
  | "jaw"
  | "leftShoulder"
  | "rightShoulder"
  | "leftUpperArm"
  | "rightUpperArm"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftHand"
  | "rightHand";

type EmotionName = "neutral" | "happy" | "angry" | "sad" | "thinking";

function isObject3D(v: unknown): v is Object3D {
  return !!v && typeof v === "object" && "position" in (v as any) && "rotation" in (v as any);
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function approach(current: number, target: number, ratePerSec: number, dt: number) {
  const a = 1 - Math.exp(-ratePerSec * Math.max(0, dt));
  return current + (target - current) * a;
}

function isPromiseLike(x: unknown): x is Promise<unknown> {
  return !!x && typeof x === "object" && typeof (x as any).then === "function";
}

type MotionState = "idle" | "talk" | "gesture";
type GestureName =
  | "none"
  | "nod"
  | "shake_head"
  | "tilt_head"
  | "look_side"
  | "shrug"
  | "bow"
  | "wave"
  | "think"
  | "surprise"
  | "laugh"
  | "arms_cross";
type LookMode = "camera" | "idle_wander" | "thinking_away";

export type LookAtOffset = { x: number; y: number; z: number };

export class MotionManager {
  private vrm: VRM;
  private t = 0;

  // Facial expressions are fixed to default (neutral) by default.
  // Lip-sync visemes are still applied when speaking.
  private faceFixedToDefault = true;

  private bodyEnabled = true;
  private speaking = false;
  private emotion: EmotionName = "neutral";

  private state: MotionState = "idle";
  private nextAutoGestureAtT = 0;

  private talkWeight = 0;
  private mouthOpen = 0;
  private jawOpen = 0;
  private lipSyncLevel = 0;
  private lipSyncWeights: { wAa: number; wIh: number; wOu: number; wEe: number; wOh: number } | null =
    null;
  private gesture: GestureName = "none";
  private gestureStartedAtT = 0;
  private gestureUntilT: number | null = null;
  private gestureHold = false;

  private exprTargets = new Map<string, number>();
  private exprValues = new Map<string, number>();

  private blinkPhase = 0;
  private viseme = "aa";
  private visemePhase = 0;
  private visemeKeyMode: "unknown" | "vrm1" | "vrm0" | "both" = "unknown";

  private baseQuat = new Map<BoneName, ThreeQuaternion>();
  private jawOverride: Object3D | null = null;

  private lookMode: LookMode = "idle_wander";
  private nextLookModeAtT = 0;
  private lookOffset: LookAtOffset = { x: 0, y: 0, z: 0 };
  private lookOffsetTarget: LookAtOffset = { x: 0, y: 0, z: 0 };
  private nextSaccadeAtT = 0;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    // Start subtle idle gestures a little after spawn, not instantly.
    this.nextAutoGestureAtT = 8 + Math.random() * 8;
  }

  setFaceFixedToDefault(fixed: boolean) {
    this.faceFixedToDefault = !!fixed;
  }

  setBodyEnabled(enabled: boolean) {
    this.bodyEnabled = !!enabled;
  }

  setJawBone(node: Object3D | null) {
    this.jawOverride = node;
  }

  setSpeaking(next: boolean) {
    this.speaking = !!next;
  }

  setLipSyncLevel(level: number | null | undefined) {
    const v = Number(level);
    if (!Number.isFinite(v)) return;
    this.lipSyncLevel = clamp01(v);
  }

  setLipSyncWeights(
    w:
      | { wAa: number; wIh: number; wOu: number; wEe: number; wOh: number }
      | null
      | undefined,
  ) {
    if (!w) {
      this.lipSyncWeights = null;
      return;
    }
    this.lipSyncWeights = {
      wAa: clamp01(w.wAa),
      wIh: clamp01(w.wIh),
      wOu: clamp01(w.wOu),
      wEe: clamp01(w.wEe),
      wOh: clamp01(w.wOh),
    };
  }

  setEmotion(raw: string | null | undefined) {
    const v = String(raw ?? "").trim().toLowerCase();
    const e: EmotionName =
      v === "happy" ? "happy" :
      v === "angry" ? "angry" :
      v === "sad" ? "sad" :
      v === "thinking" ? "thinking" :
      v === "neutral" ? "neutral" :
      "neutral";
    this.emotion = e;
  }

  triggerGesture(raw: string | null | undefined) {
    const v = String(raw ?? "").trim().toLowerCase();
    if (!v) return;

    const start = (name: GestureName, secs: number, hold: boolean) => {
      this.gesture = name;
      this.gestureStartedAtT = this.t;
      this.gestureHold = hold;
      this.gestureUntilT = hold ? this.t + secs : this.t + secs;
    };

    if (v === "nod") return start("nod", 0.7, false);
    if (v === "shake_head" || v === "shake-head") return start("shake_head", 0.8, false);
    if (v === "tilt_head" || v === "tilt-head") return start("tilt_head", 1.2, false);
    if (v === "look_side" || v === "look-side") return start("look_side", 1.1, false);
    if (v === "shrug") return start("shrug", 0.9, false);
    if (v === "bow") return start("bow", 1.2, false);
    if (v === "wave") return start("wave", 1.4, false);
    if (v === "think" || v === "thinking") return start("think", 2.2, true);
    if (v === "surprise") return start("surprise", 1.0, false);
    if (v === "laugh") return start("laugh", 1.4, false);
    if (v === "arms_cross" || v === "arms-cross" || v === "armscross")
      return start("arms_cross", 6.0, true);
  }

  private getBone(name: BoneName): Object3D | null {
    const humanoid: any = (this.vrm as any).humanoid;
    if (!humanoid) return null;

    // Prefer normalized bones (recommended for animation). Fallback to raw / map.
    const candidates = [
      humanoid.getNormalizedBoneNode as ((bone: any) => unknown) | undefined,
      humanoid.getRawBoneNode as ((bone: any) => unknown) | undefined,
      humanoid.getBoneNode as ((bone: any) => unknown) | undefined,
    ].filter((f): f is (bone: any) => unknown => typeof f === "function");

    for (const fn of candidates) {
      try {
        const node = fn.call(humanoid, name);
        const o = isObject3D(node) ? node : null;
        if (o) {
          if (!this.baseQuat.has(name)) {
            this.baseQuat.set(
              name,
              (o.quaternion as any as ThreeQuaternion).clone(),
            );
          }
          return o;
        }
      } catch {
        // try next
      }
    }

    const hb = humanoid.humanBones as Record<string, { node?: unknown }> | undefined;
    const node = hb?.[name]?.node;
    const o = isObject3D(node) ? node : null;
    if (o && !this.baseQuat.has(name)) {
      this.baseQuat.set(name, (o.quaternion as any as ThreeQuaternion).clone());
    }
    return o;
  }

  private setExprTarget(key: string, value: number) {
    this.exprTargets.set(key, clamp01(value));
  }

  private resolveVisemeKeyMode(em: any) {
    if (this.visemeKeyMode !== "unknown") return;

    const collectKeys = (): Set<string> | null => {
      try {
        const keys = new Set<string>();

        const addKey = (k: unknown) => {
          const s = typeof k === "string" ? k : "";
          if (s) keys.add(s);
        };

        const addFrom = (v: any) => {
          if (!v) return;
          if (v instanceof Map) {
            for (const k of v.keys()) addKey(k);
            return;
          }
          if (Array.isArray(v)) {
            for (const it of v) {
              if (!it || typeof it !== "object") continue;
              addKey((it as any).expressionName);
              addKey((it as any).presetName);
              addKey((it as any).name);
              addKey((it as any).key);
            }
            return;
          }
          if (typeof v === "object") {
            for (const k of Object.keys(v)) addKey(k);
          }
        };

        addFrom((em as any).expressionMap);
        addFrom((em as any)._expressionMap);
        addFrom((em as any).expressions);

        return keys.size ? keys : null;
      } catch {
        return null;
      }
    };

    const keys = collectKeys();
    if (!keys) {
      this.visemeKeyMode = "both";
      return;
    }

    const vrm1 = ["aa", "ih", "ou", "ee", "oh"];
    const vrm0 = ["A", "I", "U", "E", "O"];
    const hasVrm1 = vrm1.some((k) => keys.has(k));
    const hasVrm0 = vrm0.some((k) => keys.has(k));

    // Prefer VRM1 when both exist.
    this.visemeKeyMode = hasVrm1 ? "vrm1" : hasVrm0 ? "vrm0" : "both";
  }

  private flushExpressionTargets(dt: number, em: any) {
    this.resolveVisemeKeyMode(em);
    // NOTE:
    // Some VRM loaders expose `expressionManager.expressions` as an Array/Map,
    // so enumerating keys can yield only indices ("0", "1", ...).
    // To keep this robust, we optimistically set common preset names and let
    // `setValue` ignore/throw for missing ones (caught in applyExpressions).

    // Reset emotion-related expressions to 0 before setting.
    const happyKeys = ["happy", "joy"];
    const angryKeys = ["angry"];
    const sadKeys = ["sad"];
    const surprisedKeys = ["surprised", "surprise"];
    const blinkKeys = ["blink"];

    for (const k of [...happyKeys, ...angryKeys, ...sadKeys, ...surprisedKeys, ...blinkKeys]) {
      this.setExprTarget(k, 0);
    }

    if (!this.faceFixedToDefault) {
      if (this.emotion === "happy") for (const k of happyKeys) this.setExprTarget(k, 0.9);
      if (this.emotion === "angry") for (const k of angryKeys) this.setExprTarget(k, 0.75);
      if (this.emotion === "sad") for (const k of sadKeys) this.setExprTarget(k, 0.75);
      if (this.emotion === "thinking") {
        // keep neutral face but blink a bit slower and keep mouth variation smaller (handled elsewhere)
      }

      // gesture-driven expression accents
      if (this.gesture === "surprise") for (const k of surprisedKeys) this.setExprTarget(k, 0.85);
      if (this.gesture === "laugh") for (const k of happyKeys) this.setExprTarget(k, 1.0);

      // Blink (procedural)
      const blinkVal = this.computeBlinkValue(dt);
      for (const k of blinkKeys) this.setExprTarget(k, blinkVal);
    }

    // Visemes (VRM1 typically provides aa/ih/ou/ee/oh)
    const vrm1Visemes = ["aa", "ih", "ou", "ee", "oh"];
    const vrm0Visemes = ["A", "I", "U", "E", "O"];
    for (const k of [...vrm1Visemes, ...vrm0Visemes]) this.setExprTarget(k, 0);

    const open = this.mouthOpen;
    if (open > 0) {
      const { wAa, wIh, wOu, wEe, wOh } = this.lipSyncWeights ?? this.computeVisemeWeights(dt);

      // Driving both VRM1 and VRM0 visemes (when a model exposes both) can over-blend and look "gacha-gacha".
      // Choose a single key set when possible.
      if (this.visemeKeyMode === "vrm0") {
        this.setExprTarget("A", open * wAa);
        this.setExprTarget("I", open * wIh);
        this.setExprTarget("U", open * wOu);
        this.setExprTarget("E", open * wEe);
        this.setExprTarget("O", open * wOh);
      } else if (this.visemeKeyMode === "vrm1") {
        this.setExprTarget("aa", open * wAa);
        this.setExprTarget("ih", open * wIh);
        this.setExprTarget("ou", open * wOu);
        this.setExprTarget("ee", open * wEe);
        this.setExprTarget("oh", open * wOh);
      } else {
        this.setExprTarget("aa", open * wAa);
        this.setExprTarget("ih", open * wIh);
        this.setExprTarget("ou", open * wOu);
        this.setExprTarget("ee", open * wEe);
        this.setExprTarget("oh", open * wOh);
        this.setExprTarget("A", open * wAa);
        this.setExprTarget("I", open * wIh);
        this.setExprTarget("U", open * wOu);
        this.setExprTarget("E", open * wEe);
        this.setExprTarget("O", open * wOh);
      }
    }
  }

  private computeBlinkValue(dt: number): number {
    // Natural-ish blink using a sawtooth phase.
    // thinking -> less frequent blink
    const interval = this.emotion === "thinking" ? 5.0 : 3.2;
    this.blinkPhase += Math.max(0, dt) / interval;
    if (this.blinkPhase >= 1) this.blinkPhase -= 1;

    // Close quickly, open quickly.
    const p = this.blinkPhase;
    const closeWindow = 0.06;
    const openWindow = 0.12;
    if (p < closeWindow) return p / closeWindow;
    if (p < openWindow) return 1 - (p - closeWindow) / (openWindow - closeWindow);
    return 0;
  }

  private computeMouthOpen(): number {
    // Open amount for talking:
    // - talkWeight drives amplitude (idle -> 0)
    // - visemePhase adds variation
    // NOTE: keep this a bit exaggerated for visibility in the chat stage.
    const amp = 0.55 + 0.35 * this.talkWeight;

    // Sharper open/close envelope so it reads as "hakkiri" without high-frequency twitch.
    const wave = Math.sin(this.t * 8.8);
    const syll = Math.pow(Math.abs(wave), 0.55); // 0..1 (spikier than plain sin)
    const base = 0.14 + amp * syll;
    const jitter = 0.03 * Math.sin(this.t * 11.0 + 1.7);
    const gain = 1.9;
    return clamp01((base + jitter) * gain * (0.7 + 0.3 * this.talkWeight));
  }

  private computeVisemeWeights(dt: number): {
    wAa: number;
    wIh: number;
    wOu: number;
    wEe: number;
    wOh: number;
  } {
    // Simple cyclic viseme selector (until real phoneme timing exists).
    // thinking emotion reduces mouth variation.
    const speed = this.emotion === "thinking" ? 0.9 : 1.4;
    // Slow it down to avoid "twitchy" mouth shapes.
    this.visemePhase += Math.max(0, dt) * speed * 0.35;
    if (this.visemePhase >= 1) this.visemePhase -= 1;

    const phase = this.visemePhase;
    const pick =
      phase < 0.24
        ? "aa"
        : phase < 0.44
          ? "ih"
          : phase < 0.64
            ? "ou"
            : phase < 0.82
              ? "ee"
              : "oh";

    // Slightly blend adjacent visemes to avoid "snapping".
    const blend = 0.25;
    const w = (k: string) => (k === pick ? 1 : 0);
    let wAa = w("aa");
    let wIh = w("ih");
    let wOu = w("ou");
    let wEe = w("ee");
    let wOh = w("oh");

    // Adjacent blending by phase windows
    if (phase > 0.20 && phase < 0.28) {
      wAa = 1 - blend;
      wIh = blend;
    } else if (phase > 0.40 && phase < 0.48) {
      wIh = 1 - blend;
      wOu = blend;
    } else if (phase > 0.60 && phase < 0.68) {
      wOu = 1 - blend;
      wEe = blend;
    } else if (phase > 0.78 && phase < 0.86) {
      wEe = 1 - blend;
      wOh = blend;
    } else if (phase > 0.94 || phase < 0.02) {
      wOh = 1 - blend;
      wAa = blend;
    }

    return { wAa, wIh, wOu, wEe, wOh };
  }

  update(dt: number) {
    const d = Math.max(0, dt);
    this.t += d;

    const targetTalk = this.speaking ? 1 : 0;
    this.talkWeight = approach(this.talkWeight, targetTalk, 10, d);

    // Smooth mouth open to avoid frame-to-frame jitter.
    // Prefer audio-driven lipSyncLevel when available.
    const hasAudioLevel = this.lipSyncLevel > 0.0001;
    const targetOpen = this.speaking
      ? hasAudioLevel
        ? this.lipSyncLevel
        : this.computeMouthOpen()
      : 0;
    const rate = targetOpen >= this.mouthOpen ? 18 : 10;
    this.mouthOpen = approach(this.mouthOpen, targetOpen, rate, d);

    // Jaw follows audio RMS a bit more aggressively than the viseme amplitude.
    // This adds "talking energy" without changing the viseme shapes themselves.
    const targetJaw = this.speaking
      ? hasAudioLevel
        ? clamp01(this.lipSyncLevel * 1.15)
        : this.mouthOpen
      : 0;
    const jawRate = targetJaw >= this.jawOpen ? 22 : 12;
    this.jawOpen = approach(this.jawOpen, targetJaw, jawRate, d);

    const gestureWeight = this.getGestureWeight();

    if (gestureWeight > 0.12) this.state = "gesture";
    else if (this.talkWeight > 0.15) this.state = "talk";
    else this.state = "idle";

    this.maybeAutoGesture();
    this.updateLook(d);

    if (this.bodyEnabled) this.applyProceduralPose(d);
    this.applyExpressions(d);
  }

  private maybeAutoGesture() {
    // Desktop mascot / always-on VRM looks "alive" with rare gestures.
    // Keep it conservative: trigger only when idle and not speaking.
    if (this.speaking) return;
    if (this.state !== "idle") return;
    if (this.gesture !== "none") return;
    if (this.t < this.nextAutoGestureAtT) return;

    // Weighted random pick (subtle actions more common).
    const pool: Array<{ name: GestureName; w: number }> = [
      { name: "look_side", w: 2.0 },
      { name: "tilt_head", w: 1.6 },
      { name: "nod", w: 1.2 },
      { name: "shrug", w: 0.7 },
      { name: "think", w: 0.8 },
      { name: "laugh", w: 0.25 },
      { name: "wave", w: 0.18 },
      { name: "arms_cross", w: 0.35 },
      { name: "bow", w: 0.12 },
      { name: "surprise", w: 0.12 },
    ];

    let sum = 0;
    for (const p of pool) sum += Math.max(0, p.w);
    let r = Math.random() * (sum || 1);
    let picked: GestureName = "nod";
    for (const p of pool) {
      r -= Math.max(0, p.w);
      if (r <= 0) {
        picked = p.name;
        break;
      }
    }

    // Trigger via the same mapping as external gestures.
    this.triggerGesture(picked);

    // Next idle gesture cooldown.
    const base = picked === "arms_cross" ? 18 : picked === "think" ? 14 : 11;
    this.nextAutoGestureAtT = this.t + base + Math.random() * 18;
  }

  private getGestureWeight() {
    if (this.gesture === "none") return 0;
    if (this.gestureUntilT == null) return 0;
    const started = this.gestureStartedAtT;
    const until = this.gestureUntilT;
    const now = this.t;
    if (now <= started) return 0;
    const dur = Math.max(0.0001, until - started);
    const p = MathUtils.clamp((now - started) / dur, 0, 1);
    const easeIn = MathUtils.smoothstep(p, 0, 0.18);
    if (this.gestureHold) {
      // Hold at 1 after easing in.
      return easeIn;
    }
    // One-shot: ease in then out.
    const easeOut = 1 - MathUtils.smoothstep(p, 0.68, 1);
    return Math.min(easeIn, easeOut);
  }

  /**
   * Natural gaze policy:
   * - speaking: look at camera (mostly)
   * - thinking: avert gaze slightly + occasional saccades
   * - idle: wander gaze occasionally (not always staring)
   */
  private updateLook(dt: number) {
    const wantsCamera =
      this.speaking || this.state === "talk" || this.state === "gesture";

    if (wantsCamera) {
      this.lookMode = "camera";
      this.nextLookModeAtT = this.t + 0.8;
    } else if (this.emotion === "thinking") {
      if (this.lookMode !== "thinking_away" && this.t >= this.nextLookModeAtT) {
        this.lookMode = "thinking_away";
        this.nextLookModeAtT = this.t + 1.8 + Math.random() * 1.8;
      }
    } else {
      if (this.lookMode === "camera" && this.t >= this.nextLookModeAtT) {
        this.lookMode = "idle_wander";
        this.nextLookModeAtT = this.t + 2.2 + Math.random() * 2.2;
      } else if (this.lookMode !== "idle_wander" && this.t >= this.nextLookModeAtT) {
        this.lookMode = "idle_wander";
        this.nextLookModeAtT = this.t + 2.2 + Math.random() * 2.2;
      }
    }

    // Update target offset (in camera space) based on lookMode.
    // Values tuned for a "chat bust-up" framing.
    if (this.lookMode === "camera") {
      this.lookOffsetTarget = { x: 0.0, y: 0.0, z: 0.0 };
    } else if (this.lookMode === "thinking_away") {
      // Slightly down + off-center, occasional saccades (no continuous wobble).
      if (this.t >= this.nextSaccadeAtT) {
        const sx = 0.12 + (Math.random() - 0.5) * 0.12;
        const sy = -0.10 + (Math.random() - 0.5) * 0.08;
        this.lookOffsetTarget = { x: sx, y: sy, z: 0.0 };
        this.nextSaccadeAtT = this.t + 1.0 + Math.random() * 1.4;
      }
    } else {
      // idle_wander: occasional small saccades around camera (no continuous wobble).
      if (this.t >= this.nextSaccadeAtT) {
        const x = (Math.random() - 0.5) * 0.18;
        const y = (Math.random() - 0.5) * 0.10;
        this.lookOffsetTarget = { x, y, z: 0.0 };
        this.nextSaccadeAtT = this.t + 1.2 + Math.random() * 2.0;
      }
    }

    // Smooth approach to avoid jitter
    this.lookOffset = {
      x: approach(this.lookOffset.x, this.lookOffsetTarget.x, 4.5, dt),
      y: approach(this.lookOffset.y, this.lookOffsetTarget.y, 4.5, dt),
      z: approach(this.lookOffset.z, this.lookOffsetTarget.z, 4.5, dt),
    };
  }

  getLookAtOffset(): LookAtOffset {
    return this.lookOffset;
  }

  private applyProceduralPose(dt: number) {
    const head = this.getBone("head");
    const neck = this.getBone("neck");
    const chest = this.getBone("chest") ?? this.getBone("spine");
    const hips = this.getBone("hips");
    const jaw = this.jawOverride ?? this.getBone("jaw");
    const lShoulder = this.getBone("leftShoulder");
    const rShoulder = this.getBone("rightShoulder");
    const lUpper = this.getBone("leftUpperArm");
    const rUpper = this.getBone("rightUpperArm");
    const lLower = this.getBone("leftLowerArm");
    const rLower = this.getBone("rightLowerArm");
    const lHand = this.getBone("leftHand");
    const rHand = this.getBone("rightHand");

    // Natural-ish values for a chat character (not too much).
    const idleBreath = 0.045 * Math.sin(this.t * 1.2);
    const idleSway = 0.03 * Math.sin(this.t * 0.7 + 0.8);

    const talkBob = 0.065 * Math.sin(this.t * 4.2) * this.talkWeight;
    const talkSway = 0.04 * Math.sin(this.t * 2.6 + 0.4) * this.talkWeight;

    const gw = this.getGestureWeight();
    const g = this.gesture;

    const nod =
      g === "nod" ? gw * 0.22 * Math.sin(this.t * 9.0) : 0;
    const shake =
      g === "shake_head" ? gw * 0.22 * Math.sin(this.t * 10.0) : 0;
    const tilt =
      g === "tilt_head" ? gw * 0.28 * Math.sin(this.t * 2.4) : 0;
    const lookSide =
      g === "look_side" ? gw * 0.35 * Math.sin(this.t * 1.8) : 0;
    const shrug =
      g === "shrug" ? gw : 0;
    const bow =
      g === "bow" ? gw : 0;
    const wave =
      g === "wave" ? gw : 0;
    const think =
      g === "think" ? gw : 0;
    const surprise =
      g === "surprise" ? gw : 0;
    const laugh =
      g === "laugh" ? gw : 0;

    const armsCrossWeight = g === "arms_cross" ? gw : 0;

    const applyOffsetEuler = (
      boneName: BoneName,
      bone: Object3D | null,
      offset: Euler,
      rate: number,
    ) => {
      if (!bone) return;
      const base =
        this.baseQuat.get(boneName) ??
        (bone.quaternion as any as ThreeQuaternion).clone();
      if (!this.baseQuat.has(boneName)) this.baseQuat.set(boneName, base.clone());

      const q = new ThreeQuaternion().setFromEuler(offset);
      const target = (base.clone() as any as ThreeQuaternion).multiply(q);
      const a = 1 - Math.exp(-rate * Math.max(0, dt));
      (bone.quaternion as any as ThreeQuaternion).slerp(target, a);
    };

    // Idle / talk posture (small)
    applyOffsetEuler("hips", hips, new Euler(0, idleSway * 0.4, 0), 8);
    applyOffsetEuler(
      "chest",
      chest,
      new Euler(idleBreath + talkBob * 0.5, talkSway * 0.25, 0),
      10,
    );
    applyOffsetEuler(
      "neck",
      neck,
      new Euler(
        talkBob * 0.2 + nod * 0.15 + (bow ? 0.35 * bow : 0),
        talkSway * 0.15 + shake * 0.65 + lookSide * 0.8,
        tilt * 0.55,
      ),
      12,
    );
    applyOffsetEuler(
      "head",
      head,
      new Euler(
        talkBob * 0.35 + nod + (bow ? 0.45 * bow : 0) + (surprise ? -0.25 * surprise : 0),
        talkSway * 0.25 + shake + lookSide,
        tilt + (laugh ? 0.08 * Math.sin(this.t * 6.5) * laugh : 0),
      ),
      14,
    );

    // Jaw lip-sync disabled by default for this model (jaw is not mapped in humanoid).
    // Keep jaw override hook for future models, but prefer viseme expressions.
    if (jaw) {
      const open = this.jawOpen;
      const maxOpen = 0.35;
      const ang = -maxOpen * open;
      applyOffsetEuler("jaw", jaw, new Euler(ang, 0, 0), 16);
    }

    // Arms: baseline + subtle talk
    if (lUpper && rUpper) {
      const armTalk = 0.12 * Math.sin(this.t * 3.2) * this.talkWeight;
      const shrugUp = 0.25 * shrug;

      applyOffsetEuler(
        "leftUpperArm",
        lUpper,
        // Relax arms a bit from a straight T-pose (common after conversion).
        new Euler(
          -0.35 - shrugUp * 0.25,
          0.05 + (wave ? 0.15 * wave : 0),
          -0.35 + armTalk * 0.18 + (wave ? -0.35 * wave : 0),
        ),
        10,
      );
      applyOffsetEuler(
        "rightUpperArm",
        rUpper,
        new Euler(
          -0.35 - shrugUp * 0.25 + (wave ? -0.75 * wave : 0) + (think ? -0.65 * think : 0),
          -0.05 + (wave ? -0.25 * wave : 0) + (think ? -0.35 * think : 0),
          0.35 - armTalk * 0.18 + (wave ? 0.55 * wave : 0) + (think ? 0.35 * think : 0),
        ),
        10,
      );
    }
    if (lLower) {
      applyOffsetEuler("leftLowerArm", lLower, new Euler(-0.15, 0, 0), 10);
    }
    if (rLower) {
      // wave/think overrides lower arm
      const waveBend = wave ? 0.9 * Math.sin(this.t * 10.0) * wave : 0;
      const thinkBend = think ? 1.15 * think : 0;
      applyOffsetEuler(
        "rightLowerArm",
        rLower,
        new Euler(-0.15 - thinkBend - 0.35 * wave, waveBend, 0),
        12,
      );
    }
    if (rHand) {
      const waveTwist = wave ? 0.9 * Math.sin(this.t * 12.0) * wave : 0;
      const thinkHand = think ? -0.35 * think : 0;
      applyOffsetEuler("rightHand", rHand, new Euler(thinkHand, 0, waveTwist), 14);
    }

    // Gesture: arms_cross (pose)
    if (armsCrossWeight > 0.001) {
      const w = armsCrossWeight;

      const lerp = (a: number, b: number) => MathUtils.lerp(a, b, w);

      // Shoulders slightly forward.
      applyOffsetEuler(
        "leftShoulder",
        lShoulder,
        new Euler(lerp(0, 0.25), lerp(0, 0.15), lerp(0, -0.15)),
        14,
      );
      applyOffsetEuler(
        "rightShoulder",
        rShoulder,
        new Euler(lerp(0, 0.25), lerp(0, -0.15), lerp(0, 0.15)),
        14,
      );

      // Upper arms move inward across chest.
      applyOffsetEuler(
        "leftUpperArm",
        lUpper,
        // More aggressive cross for this model: forward + inward + across
        new Euler(lerp(-0.35, 0.55), lerp(0.05, 0.95), lerp(-0.35, -1.55)),
        16,
      );
      applyOffsetEuler(
        "rightUpperArm",
        rUpper,
        new Euler(lerp(-0.35, 0.55), lerp(-0.05, -0.95), lerp(0.35, 1.55)),
        16,
      );

      // Forearms fold to create the cross.
      applyOffsetEuler(
        "leftLowerArm",
        lLower,
        new Euler(lerp(-0.15, -1.25), lerp(0, 0.55), lerp(0, -0.55)),
        18,
      );
      applyOffsetEuler(
        "rightLowerArm",
        rLower,
        new Euler(lerp(-0.15, -1.25), lerp(0, -0.55), lerp(0, 0.55)),
        18,
      );

      // Hands angle slightly to look natural.
      applyOffsetEuler(
        "leftHand",
        lHand,
        new Euler(lerp(0, 0.2), lerp(0, 0.35), lerp(0, 0.65)),
        20,
      );
      applyOffsetEuler(
        "rightHand",
        rHand,
        new Euler(lerp(0, 0.2), lerp(0, -0.35), lerp(0, -0.65)),
        20,
      );
    }

    if (this.gestureUntilT != null && this.t >= this.gestureUntilT) {
      if (!this.gestureHold) {
        this.gesture = "none";
        this.gestureUntilT = null;
      } else {
        // Hold gestures time out and fade out naturally by switching to none.
        this.gesture = "none";
        this.gestureUntilT = null;
      }
    }
  }

  private applyExpressions(dt: number) {
    const em: any = (this.vrm as any).expressionManager;
    if (!em) return;

    this.flushExpressionTargets(dt, em);

    for (const [key, target] of this.exprTargets) {
      const current = this.exprValues.get(key) ?? 0;
      const next = approach(current, target, 10, dt);
      this.exprValues.set(key, next);
      try {
        const r = em.setValue(key, next);
        // Some implementations return a Promise; ignore it.
        if (isPromiseLike(r)) void r;
      } catch {
        // ignore
      }
    }
  }
}
