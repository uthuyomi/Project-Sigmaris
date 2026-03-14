"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AnimationAction, AnimationClip, AnimationMixer, KeyframeTrack, Object3D } from "three";
import type { VRM } from "@pixiv/three-vrm";
import { MotionManager } from "@/components/vrm/MotionManager";

type Props = {
  url: string;
  speaking?: boolean;
  emotion?: string | null;
  gesture?: string | null;
  gestureNonce?: number;
  getLipSyncFrame?:
    | (() => {
        level: number;
        weights: null | { wAa: number; wIh: number; wOu: number; wEe: number; wOh: number };
      })
    | null;
  cameraYawDeg?: number;
  cameraPitchDeg?: number;
  cameraDistance?: number;
  cameraFov?: number;
  className?: string;
};

export default function VrmStage({
  url,
  speaking,
  emotion,
  gesture,
  gestureNonce,
  getLipSyncFrame,
  cameraYawDeg,
  cameraPitchDeg,
  cameraDistance,
  cameraFov,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const [debugText, setDebugText] = useState<string | null>(null);
  const [scanText, setScanText] = useState<string | null>(null);

  const normalizedUrl = useMemo(() => String(url ?? "").trim(), [url]);

  const motionRef = useRef<MotionManager | null>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, AnimationAction>>({});
  const actionKindsRef = useRef<{ idle: string[]; talk: string[]; gesture: string[] }>({
    idle: [],
    talk: [],
    gesture: [],
  });
  const activeBaseActionRef = useRef<string | null>(null);
  const motionClockTRef = useRef(0);
  const nextIdleSwitchAtTRef = useRef(0);
  const playGestureOnceRef = useRef<((gesture: string) => void) | null>(null);
  const lastGestureNonceRef = useRef<number | null>(null);
  const lookAtRef = useRef<any | null>(null);
  const lookTargetRef = useRef<import("three").Object3D | null>(null);
  const cameraParamsRef = useRef({
    yawDeg: 0,
    pitchDeg: 0,
    distance: 2.15,
    fov: 30,
    targetX: 0,
    targetY: 0.88,
    targetZ: 0,
  });

  const debugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get("vrmDebug") === "1";
    } catch {
      return false;
    }
  }, []);

  const scanOnceRef = useRef<string | null>(null);
  const lipSyncGetterRef = useRef<
    | (() => {
        level: number;
        weights: null | { wAa: number; wIh: number; wOu: number; wEe: number; wOh: number };
      })
    | null
  >(null);

  useEffect(() => {
    lipSyncGetterRef.current = typeof getLipSyncFrame === "function" ? getLipSyncFrame : null;
  }, [getLipSyncFrame]);

  useEffect(() => {
    const mm = motionRef.current;
    if (!mm) return;
    mm.setSpeaking(!!speaking);
  }, [speaking]);

  useEffect(() => {
    cameraParamsRef.current.yawDeg = Number.isFinite(Number(cameraYawDeg))
      ? Number(cameraYawDeg)
      : 0;
  }, [cameraYawDeg]);

  useEffect(() => {
    cameraParamsRef.current.pitchDeg = Number.isFinite(Number(cameraPitchDeg))
      ? Number(cameraPitchDeg)
      : 0;
  }, [cameraPitchDeg]);

  useEffect(() => {
    const d = Number(cameraDistance);
    cameraParamsRef.current.distance = Number.isFinite(d) ? d : 2.15;
  }, [cameraDistance]);

  useEffect(() => {
    const f = Number(cameraFov);
    cameraParamsRef.current.fov = Number.isFinite(f) ? f : 30;
  }, [cameraFov]);

  useEffect(() => {
    const mm = motionRef.current;
    if (!mm) return;
    mm.setEmotion(emotion);
  }, [emotion]);

  useEffect(() => {
    const mm = motionRef.current;
    if (!mm) return;
    if (typeof gestureNonce === "number") {
      if (lastGestureNonceRef.current === gestureNonce) return;
      lastGestureNonceRef.current = gestureNonce;
    }
    if (gesture) mm.triggerGesture(gesture);
    if (gesture) playGestureOnceRef.current?.(gesture);
  }, [gesture, gestureNonce]);

  useEffect(() => {
    const mixer = mixerRef.current;
    const actions = actionsRef.current;
    if (!mixer) return;

    const kinds = actionKindsRef.current;
    const hasTalk = kinds.talk.length > 0;
    const wantsTalk = !!speaking && hasTalk;
    const base = wantsTalk ? kinds.talk[0] : kinds.idle[0];
    if (!base) return;

    const startBase = (name: string) => {
      const next = actions[name];
      if (!next) return;
      const currentName = activeBaseActionRef.current;
      if (currentName === name) return;
      const prev = currentName ? actions[currentName] : null;
      activeBaseActionRef.current = name;

      try {
        next.enabled = true;
        next.reset();
        next.setEffectiveWeight?.(1);
        next.fadeIn(0.18);
        next.play();
        if (prev) {
          prev.fadeOut(0.18);
        }
      } catch {
        // ignore
      }
    };

    startBase(base);
  }, [speaking]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    if (!normalizedUrl) {
      setStatus("error");
      setErrorText("VRM URL is empty");
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    setStatus("loading");
    setErrorText(null);

    void (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import(
        "three/examples/jsm/loaders/GLTFLoader.js",
      );
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");

      if (cancelled) return;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
      // Ensure the canvas clears with transparent alpha (desktop/window behind remains visible).
      try {
        renderer.setClearColor(0x000000, 0);
      } catch {
        // ignore
      }

      const anyRenderer = renderer as unknown as {
        outputColorSpace?: unknown;
        outputEncoding?: unknown;
      };
      if ("outputColorSpace" in anyRenderer) {
        (anyRenderer as { outputColorSpace: unknown }).outputColorSpace =
          (THREE as unknown as { SRGBColorSpace?: unknown }).SRGBColorSpace ??
          (anyRenderer as { outputColorSpace: unknown }).outputColorSpace;
      } else if ("outputEncoding" in anyRenderer) {
        (anyRenderer as { outputEncoding: unknown }).outputEncoding =
          (THREE as unknown as { sRGBEncoding?: unknown }).sRGBEncoding ??
          (anyRenderer as { outputEncoding: unknown }).outputEncoding;
      }

      el.replaceChildren(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        cameraParamsRef.current.fov,
        1,
        0.1,
        100,
      );
      const lookTarget = new THREE.Object3D();
      lookTargetRef.current = lookTarget;

      scene.add(new THREE.AmbientLight(0xffffff, 0.8));

      const key = new THREE.DirectionalLight(0xffffff, 1.0);
      key.position.set(2, 4, 2);
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xffffff, 0.4);
      fill.position.set(-2, 2, 3);
      scene.add(fill);

      const clock = new THREE.Clock();

      const resize = () => {
        const r = el.getBoundingClientRect();
        const w = Math.max(1, Math.floor(r.width));
        const h = Math.max(1, Math.floor(r.height));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };

      const ro = new ResizeObserver(() => resize());
      ro.observe(el);
      resize();

      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const animLoader = new GLTFLoader();

      let vrm: { scene: Object3D; update: (dt: number) => void } | null = null;
      let motion: MotionManager | null = null;
      let mixer: AnimationMixer | null = null;
      let actions: Record<string, AnimationAction> = {};

      const frameModelForStage = (root: Object3D) => {
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const height = Math.max(0.0001, size.y);
        root.scale.setScalar(1.6 / height);

        box.setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const minY = box.min.y;

        root.position.x -= center.x;
        root.position.z -= center.z;
        root.position.y -= minY;

        // Default "full body" framing; user can orbit/zoom/pan via mouse.
        camera.position.set(0, 1.05, 2.15);
        camera.lookAt(0, 0.88, 0);
      };

      const findActionByKeywords = (names: string[], keywords: string[]) => {
        const lower = names.map((n) => ({ n, l: n.toLowerCase() }));
        for (const { n, l } of lower) {
          if (keywords.every((k) => l.includes(k))) return n;
        }
        return null;
      };

      const buildNameMap = (root: Object3D) => {
        const map = new Map<string, Object3D[]>();
        root.traverse((o: any) => {
          const nm = typeof o?.name === "string" ? o.name : "";
          if (!nm) return;
          const arr = map.get(nm) ?? [];
          arr.push(o as Object3D);
          map.set(nm, arr);
        });
        return map;
      };

      const cloneAndRetargetClipToRoot = (clip: AnimationClip, root: Object3D) => {
        const nameMap = buildNameMap(root);
        const tracks: KeyframeTrack[] = [];
        let total = 0;
        let mapped = 0;
        let missing = 0;

        for (const t of clip.tracks ?? []) {
          total++;
          const rawName = String((t as any).name ?? "");
          const dot = rawName.indexOf(".");
          if (dot <= 0) {
            tracks.push(t.clone());
            continue;
          }
          const nodeName = rawName.slice(0, dot);
          const rest = rawName.slice(dot + 1);

          const candidates = nameMap.get(nodeName) ?? [];
          const target = candidates[0] ?? null;
          if (!target) {
            missing++;
            // Keep original (will likely no-op), but still include so clip length stays sane.
            tracks.push(t.clone());
            continue;
          }

          mapped++;
          const nt = t.clone();
          // Use UUID binding to avoid ambiguity when names repeat.
          (nt as any).name = `${target.uuid}.${rest}`;
          tracks.push(nt);
        }

        const out = clip.clone();
        (out as any).tracks = tracks;

        return {
          clip: out,
          stats: { totalTracks: total, mappedTracks: mapped, missingTracks: missing },
        };
      };

      const pickGestureActionName = (gestureRaw: string | null | undefined) => {
        const g = String(gestureRaw ?? "").trim().toLowerCase();
        const names = Object.keys(actions);
        if (names.length === 0) return null;

        if (g === "nod") {
          const hard =
            findActionByKeywords(names, ["hard", "nod"]) ??
            findActionByKeywords(names, ["nod", "hard"]);
          if (hard) return hard;
          return (
            findActionByKeywords(names, ["nod", "yes"]) ??
            findActionByKeywords(names, ["head", "nod"]) ??
            findActionByKeywords(names, ["nod"])
          );
        }
        if (g === "shake_head" || g === "shake-head") {
          return (
            findActionByKeywords(names, ["shake", "no"]) ??
            findActionByKeywords(names, ["head", "no"]) ??
            findActionByKeywords(names, ["shake"])
          );
        }
        if (g === "think" || g === "thinking") {
          return findActionByKeywords(names, ["think"]);
        }
        if (g === "bow") {
          return findActionByKeywords(names, ["bow"]);
        }
        if (g === "wave") {
          return findActionByKeywords(names, ["wave"]);
        }
        if (g === "shrug") {
          return findActionByKeywords(names, ["shrug"]);
        }
        return null;
      };

      const playOneShot = (name: string) => {
        const a = actions[name];
        if (!a) return;
        try {
          // Temporarily disable VRM lookAt while the gesture plays.
          // Some VRM implementations apply head/neck rotation towards the camera, masking subtle nod/shake.
          const vLookAt = lookAtRef.current;
          const lookTarget = lookTargetRef.current;
          if (vLookAt && typeof vLookAt === "object") {
            try {
              (vLookAt as any).target = null;
              window.setTimeout(() => {
                try {
                  (vLookAt as any).target = lookTarget ?? null;
                } catch {
                  // ignore
                }
              }, 950);
            } catch {
              // ignore
            }
          }

          // Play once, but allow returning to base idle/talk automatically.
          (a as any).setLoop?.((THREE as any).LoopOnce, 1);
          a.clampWhenFinished = true;
          a.enabled = true;
          a.reset();
          a.setEffectiveWeight?.(1);
          a.setEffectiveTimeScale?.(1);
          a.fadeIn(0.08);
          a.play();

          // Make the reaction readable by briefly lowering the base layer weight.
          const baseName = activeBaseActionRef.current;
          const base = baseName ? actions[baseName] : null;
          if (base) {
            try {
              base.setEffectiveWeight?.(0.35);
              window.setTimeout(() => {
                try {
                  base.setEffectiveWeight?.(1);
                } catch {
                  // ignore
                }
              }, 700);
            } catch {
              // ignore
            }
          }

          try {
            console.info("[vrm] gesture play:", name);
          } catch {
            // ignore
          }

          // Fade out a bit later so it doesn't stick.
          window.setTimeout(() => {
            try {
              a.fadeOut(0.15);
              window.setTimeout(() => {
                try {
                  a.stop();
                  a.enabled = false;
                } catch {
                  // ignore
                }
              }, 240);
            } catch {
              // ignore
            }
          }, 900);
        } catch {
          // ignore
        }
      };

      const getHumanoidBone = (v: any, boneName: string): Object3D | null => {
        try {
          const humanoid = v?.humanoid;
          const node =
            humanoid?.getNormalizedBoneNode?.(boneName) ?? humanoid?.getRawBoneNode?.(boneName);
          return node && typeof node === "object" && "quaternion" in node ? (node as Object3D) : null;
        } catch {
          return null;
        }
      };

      const applyTalkMicroMotion = (dt: number) => {
        if (!speaking) return;
        if (!mixer) return;
        if (!vrm) return;
        motionClockTRef.current += Math.max(0, dt);
        const t = motionClockTRef.current;

        // Conservative, "Reimu-like" small motion.
        const w = 1.0;
        const chest = getHumanoidBone(vrm as any, "chest") ?? getHumanoidBone(vrm as any, "spine");
        const neck = getHumanoidBone(vrm as any, "neck");
        const head = getHumanoidBone(vrm as any, "head");
        const lShoulder = getHumanoidBone(vrm as any, "leftShoulder");
        const rShoulder = getHumanoidBone(vrm as any, "rightShoulder");

        const breath = 0.025 * Math.sin(t * 1.25);
        const bob = 0.018 * Math.sin(t * 4.2);
        const sway = 0.014 * Math.sin(t * 2.6 + 0.4);

        const qFromEuler = (x: number, y: number, z: number) =>
          new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
        const applyMul = (bone: Object3D | null, x: number, y: number, z: number, rate: number) => {
          if (!bone) return;
          const off = qFromEuler(x, y, z);
          const target = (bone.quaternion.clone() as any as import("three").Quaternion).multiply(off);
          const a = 1 - Math.exp(-rate * Math.max(0, dt));
          (bone.quaternion as any as import("three").Quaternion).slerp(target, a * w);
        };

        applyMul(chest, breath + bob * 0.35, sway * 0.25, 0, 10);
        applyMul(neck, bob * 0.15, sway * 0.35, 0, 12);
        applyMul(head, bob * 0.2, sway * 0.5, 0, 14);
        applyMul(lShoulder, -0.06 + bob * 0.05, 0.02, -0.03, 12);
        applyMul(rShoulder, -0.06 + bob * 0.05, -0.02, 0.03, 12);
      };

      loader.load(
        normalizedUrl,
        (gltf) => {
          if (cancelled) return;
          const v = (gltf as unknown as { userData?: { vrm?: unknown } }).userData
            ?.vrm as
            | { scene: Object3D; update: (dt: number) => void }
            | undefined;
          if (!v) {
            setStatus("error");
            setErrorText("Loaded file is not a VRM (missing userData.vrm)");
            return;
          }

          try {
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.removeUnnecessaryJoints(gltf.scene);
          } catch {
            // ignore
          }

          vrm = v;
          scene.add(vrm.scene);
          frameModelForStage(vrm.scene);

          try {
            motion = new MotionManager(v as unknown as VRM);
            motion.setSpeaking(!!speaking);
            motion.setEmotion(emotion);
            motionRef.current = motion;
            const vLookAt = (v as any).lookAt;
            if (vLookAt && typeof vLookAt === "object") {
              (vLookAt as any).target = lookTarget;
              lookAtRef.current = vLookAt;
            }

            // Jaw fallback: if humanoid jaw is missing, try to find a jaw-ish bone by name.
            try {
              const humanoid = (v as any).humanoid;
              const hasJaw =
                !!(humanoid?.getNormalizedBoneNode?.("jaw") ?? humanoid?.getRawBoneNode?.("jaw"));
              if (!hasJaw) {
                let found: import("three").Object3D | null = null;
                (v as any).scene?.traverse?.((o: any) => {
                  if (found) return;
                  const nm = typeof o?.name === "string" ? o.name : "";
                  if (!nm) return;
                  if (/(^jaw$|顎|あご|アゴ|jaw_)/i.test(nm)) found = o;
                });
                if (found) {
                  motion.setJawBone(found as any);
                  console.warn("[vrm] humanoid jaw missing; using fallback bone:", (found as any).name);
                } else {
                  console.warn("[vrm] humanoid jaw missing; fallback not found");
                }
              }
            } catch {
              // ignore
            }

            // Debug / diagnostics (humanoid bone mapping is a common failure point).
            const humanoid = (v as any).humanoid;
            const exprMgr = (v as any).expressionManager;
            const exprs =
              exprMgr && typeof exprMgr === "object" && exprMgr.expressions
                ? Object.keys(exprMgr.expressions as Record<string, unknown>)
                : [];

            const boneNames = [
              "head",
              "neck",
              "chest",
              "spine",
              "hips",
              "leftShoulder",
              "rightShoulder",
              "leftUpperArm",
              "rightUpperArm",
              "leftLowerArm",
              "rightLowerArm",
              "leftHand",
              "rightHand",
              "jaw",
            ];

            const hasNormalized = (n: string) => {
              try {
                return !!humanoid?.getNormalizedBoneNode?.(n);
              } catch {
                return false;
              }
            };
            const hasRaw = (n: string) => {
              try {
                return !!humanoid?.getRawBoneNode?.(n);
              } catch {
                return false;
              }
            };

            const missing = boneNames.filter((n) => !hasNormalized(n) && !hasRaw(n));
            if (missing.length) console.warn("[vrm] missing humanoid bones:", missing);

            if (debugEnabled) {
              const lines: string[] = [];
              lines.push(`VRM debug`);
              lines.push(`url: ${normalizedUrl}`);
              lines.push(`lookAt: ${vLookAt ? "yes" : "no"}`);
              lines.push(
                `expressions(${exprs.length}): ${
                  exprs.length ? exprs.slice(0, 24).join(", ") : "(none)"
                }`,
              );
              lines.push(`bones:`);
              for (const n of boneNames) {
                const tag = hasNormalized(n) ? "norm" : hasRaw(n) ? "raw" : "missing";
                lines.push(`- ${n}: ${tag}`);
              }

              // All bone names (from scene traversal) – for mapping/debug.
              const allNames: string[] = [];
              try {
                (v as any).scene?.traverse?.((o: any) => {
                  const nm = typeof o?.name === "string" ? o.name : "";
                  if (nm) allNames.push(nm);
                });
              } catch {
                // ignore
              }
              const uniqueNames = Array.from(new Set(allNames)).slice(0, 200);
              lines.push(`sceneNames(${allNames.length})[first200]: ${uniqueNames.join(", ")}`);

              setDebugText(lines.join("\n"));
              console.log("[vrm] debug:", { boneNames, missing, exprs });

              // Trigger server-side scan & save (vrm-characters/<id>.scan.json)
              try {
                const idMatch = normalizedUrl.match(/\/api\/vrm\/([^/?#]+)/);
                const id = idMatch ? decodeURIComponent(idMatch[1] ?? "") : null;
                if (id && scanOnceRef.current !== id) {
                  scanOnceRef.current = id;
                  void fetch(`/api/vrm/${encodeURIComponent(id)}/scan`, { method: "POST" })
                    .then(async (res) => {
                      const j = await res.json().catch(() => null);
                      if (res.ok) {
                        setScanText(
                          `scan saved: vrm-characters/${id}.scan.json (nodes: ${String(
                            (j as any)?.nodeCount ?? "?",
                          )})`,
                        );
                      } else {
                        setScanText(`scan failed: ${String((j as any)?.error ?? res.status)}`);
                      }
                    })
                    .catch((e) => setScanText(`scan failed: ${String((e as any)?.message ?? e)}`));
                }
              } catch {
                // ignore
              }
            } else {
              setDebugText(null);
              setScanText(null);
            }
          } catch {
            motion = null;
            motionRef.current = null;
          }

          setStatus("ready");

          // Load external motion library (GLB with animations) and drive via AnimationMixer.
          // If motions are available, we disable MotionManager's procedural body posing and
          // use it for expressions / lip-sync / look offsets only.
          void (async () => {
            try {
              let qs = "";
              try {
                const idMatch = normalizedUrl.match(/\/api\/vrm\/([^/?#]+)/);
                const id = idMatch ? decodeURIComponent(idMatch[1] ?? "") : null;
                if (id) qs = `?char=${encodeURIComponent(id)}`;
              } catch {
                qs = "";
              }

              const res = await fetch(`/api/motions${qs}`, { cache: "no-store" });
              const data = (await res.json()) as {
                motions?: Array<{ name: string; kind: "idle" | "talk" | "gesture"; url: string }>;
              };
              const list = Array.isArray(data?.motions) ? data.motions : [];
              const idle = list.filter((m) => m.kind === "idle");
              const talk = list.filter((m) => m.kind === "talk");
              const gest = list.filter((m) => m.kind === "gesture");

              const want = [...idle, ...talk, ...gest].slice(0, 24);
              if (want.length === 0) return;

              const clips: Array<{
                name: string;
                kind: "idle" | "talk" | "gesture";
                clip: AnimationClip;
                stats: { totalTracks: number; mappedTracks: number; missingTracks: number };
              }> = [];
              for (const m of want) {
                if (cancelled) return;
                await new Promise<void>((resolve) => {
                  animLoader.load(
                    m.url,
                    (agltf) => {
                      const srcClip = ((agltf as any)?.animations?.[0] ?? null) as AnimationClip | null;
                      if (srcClip && vrm) {
                        const { clip, stats } = cloneAndRetargetClipToRoot(srcClip, vrm.scene);
                        clip.name = m.name;
                        clips.push({ name: m.name, kind: m.kind, clip, stats });
                      }
                      resolve();
                    },
                    undefined,
                    () => resolve(),
                  );
                });
              }

              if (cancelled) return;
              if (!vrm) return;
              if (clips.length === 0) return;

              mixer = new THREE.AnimationMixer(vrm.scene) as any;
              actions = {};
              const kinds = { idle: [] as string[], talk: [] as string[], gesture: [] as string[] };

              for (const c of clips) {
                const a = (mixer as any).clipAction(c.clip) as AnimationAction;
                actions[c.name] = a;
                kinds[c.kind].push(c.name);
                try {
                  if (c.kind === "idle" || c.kind === "talk") {
                    (a as any).setLoop?.((THREE as any).LoopRepeat, Infinity);
                    a.clampWhenFinished = false;
                  } else {
                    (a as any).setLoop?.((THREE as any).LoopOnce, 1);
                    a.clampWhenFinished = true;
                  }
                  a.enabled = false;
                } catch {
                  // ignore
                }
              }

              // Debug summary (helps confirm bindings actually map).
              try {
                const summary = clips
                  .map((c) => `${c.name}:${c.stats.mappedTracks}/${c.stats.totalTracks}`)
                  .join(", ");
                console.info("[vrm] loaded motions:", summary);
              } catch {
                // ignore
              }

              mixerRef.current = mixer;
              actionsRef.current = actions;
              actionKindsRef.current = kinds;
              playGestureOnceRef.current = (g: string) => {
                const name = pickGestureActionName(g);
                if (name) playOneShot(name);
              };

              // Drive base motion immediately (idle preferred).
              const base = (speaking && kinds.talk.length ? kinds.talk[0] : kinds.idle[0]) ?? null;
              if (base && actions[base]) {
                activeBaseActionRef.current = base;
                try {
                  const a = actions[base];
                  a.enabled = true;
                  a.reset();
                  a.setEffectiveWeight?.(1);
                  a.fadeIn(0.12);
                  a.play();
                } catch {
                  // ignore
                }
              }

              // Idle variety: switch between idle clips occasionally to feel "alive".
              nextIdleSwitchAtTRef.current = motionClockTRef.current + 12 + Math.random() * 10;

              // Disable procedural body posing when external animation is available.
              // We keep expressions / look / lipsync via MotionManager.
              motion?.setBodyEnabled(false);
            } catch {
              // ignore (motion library is optional)
            }
          })();
        },
        undefined,
        (err) => {
          if (cancelled) return;
          setStatus("error");
          setErrorText(err instanceof Error ? err.message : "Failed to load VRM");
        },
      );

      const tick = () => {
        if (cancelled) return;
        const dt = clock.getDelta();

        // Feed audio-driven lip-sync frame (0..1 + viseme weights) BEFORE motion.update,
        // so this frame's mouth pose uses the latest audio data.
        try {
          const mm = motionRef.current;
          const fn = lipSyncGetterRef.current;
          if (mm && fn) {
            const f = fn();
            mm.setLipSyncLevel(f.level);
            mm.setLipSyncWeights(f.weights);
          } else if (mm) {
            mm.setLipSyncLevel(0);
            mm.setLipSyncWeights(null);
          }
        } catch {
          // ignore
        }

        // Update order matters:
        // - three-vrm's `vrm.update` can overwrite humanoid bone transforms based on its internal normalized rig.
        // - Our external GLB clips are baked against the raw rig (Transform curves).
        // To keep baked motion visible, update VRM first, then apply baked animation, then apply expressions/lipsync.
        // (Spring bones will be a bit less accurate; we can refine later if needed.)
        try {
          vrm?.update(dt);
        } catch {
          // ignore
        }
        try {
          mixer?.update(dt);
        } catch {
          // ignore
        }
        try {
          motion?.update(dt);
        } catch {
          // ignore
        }

        // If we don't have a talk clip, overlay a conservative procedural micro-motion while speaking.
        try {
          const kinds = actionKindsRef.current;
          const hasTalk = kinds.talk.length > 0;
          if (!hasTalk) applyTalkMicroMotion(dt);
        } catch {
          // ignore
        }

        // Idle variety (only when not speaking and not in a one-shot gesture).
        try {
          const kinds = actionKindsRef.current;
          const hasManyIdle = kinds.idle.length > 1;
          if (hasManyIdle && !speaking && motionClockTRef.current >= nextIdleSwitchAtTRef.current) {
            const actionsNow = actionsRef.current;
            const current = activeBaseActionRef.current;
            const pool = kinds.idle.filter((n) => n && n !== current);
            const nextName = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
            if (nextName && actionsNow[nextName]) {
              const next = actionsNow[nextName];
              const prev = current ? actionsNow[current] : null;
              activeBaseActionRef.current = nextName;
              try {
                next.enabled = true;
                next.reset();
                next.setEffectiveWeight?.(1);
                next.fadeIn(0.18);
                next.play();
                if (prev) prev.fadeOut(0.18);
              } catch {
                // ignore
              }
            }
            nextIdleSwitchAtTRef.current = motionClockTRef.current + 12 + Math.random() * 10;
          }
        } catch {
          // ignore
        }

        // Camera orbit (around a target with pan offsets).
        try {
          const p = cameraParamsRef.current;
          const target = new THREE.Vector3(
            Number(p.targetX) || 0,
            Number(p.targetY) || 0.88,
            Number(p.targetZ) || 0,
          );
          const yaw = THREE.MathUtils.degToRad(p.yawDeg);
          const pitch = THREE.MathUtils.degToRad(p.pitchDeg);
          const dist = Math.max(0.6, Math.min(6.0, p.distance));
          const cy = Math.cos(pitch);
          const dir = new THREE.Vector3(Math.sin(yaw) * cy, Math.sin(pitch), Math.cos(yaw) * cy);
          camera.position.copy(target).addScaledVector(dir, dist);
          const wantFov = Math.max(15, Math.min(60, p.fov));
          if (camera.fov !== wantFov) {
            camera.fov = wantFov;
            camera.updateProjectionMatrix();
          }
          camera.lookAt(target);
        } catch {
          // ignore
        }

        // Update lookAt target in world space (near-camera focus point + offset)
        // Do this AFTER camera orbit so the target doesn't "lag" one frame.
        try {
          if (motion && lookTargetRef.current) {
            const off = motion.getLookAtOffset();
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward).normalize();
            const up = camera.up.clone().normalize();
            const right = new THREE.Vector3().crossVectors(forward, up).normalize();

            // Avoid targeting the exact camera position (can cause jitter/extreme angles).
            const focusDist = 0.9;
            const targetPos = new THREE.Vector3()
              .copy(camera.position)
              .addScaledVector(forward, focusDist)
              .addScaledVector(right, off.x)
              .addScaledVector(up, off.y)
              .addScaledVector(forward, off.z);

            lookTargetRef.current.position.lerp(targetPos, 1 - Math.exp(-6 * dt));
          }
        } catch {
          // ignore
        }

        renderer.render(scene, camera);
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);

      cleanup = () => {
        cancelled = true;
        if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
        try {
          renderer.domElement.onpointerdown = null;
          renderer.domElement.onpointermove = null;
          renderer.domElement.onpointerup = null;
          renderer.domElement.onpointercancel = null;
          renderer.domElement.onwheel = null;
        } catch {
          // ignore
        }
        ro.disconnect();
        try {
          renderer.dispose();
        } catch {
          // ignore
        }
        mixerRef.current = null;
        actionsRef.current = {};
        actionKindsRef.current = { idle: [], talk: [], gesture: [] };
        activeBaseActionRef.current = null;
        playGestureOnceRef.current = null;
        motionRef.current = null;
        lookTargetRef.current = null;
        el.replaceChildren();
      };

      // Mouse/touch camera control (drag to orbit, wheel to zoom)
      try {
        let dragging = false;
        let panning = false;
        let lastX = 0;
        let lastY = 0;

        renderer.domElement.onpointerdown = (e: PointerEvent) => {
          dragging = true;
          panning = e.button === 2 || e.shiftKey;
          lastX = e.clientX;
          lastY = e.clientY;
          try {
            (e.currentTarget as any)?.setPointerCapture?.(e.pointerId);
          } catch {
            // ignore
          }
        };

        renderer.domElement.onpointermove = (e: PointerEvent) => {
          if (!dragging) return;
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;

          const p = cameraParamsRef.current;
          if (panning) {
            // Pan target in screen plane (right/up) scaled by distance.
            const dist = Math.max(0.6, Math.min(6.0, p.distance));
            const panScale = dist * 0.0017;

            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward).normalize();
            const up = camera.up.clone().normalize();
            const right = new THREE.Vector3().crossVectors(forward, up).normalize();

            const tx = (Number(p.targetX) || 0) - right.x * dx * panScale + up.x * dy * panScale;
            const ty = (Number(p.targetY) || 0.88) - right.y * dx * panScale + up.y * dy * panScale;
            const tz = (Number(p.targetZ) || 0) - right.z * dx * panScale + up.z * dy * panScale;

            p.targetX = Math.max(-1.2, Math.min(1.2, tx));
            p.targetY = Math.max(0.05, Math.min(1.65, ty));
            p.targetZ = Math.max(-1.2, Math.min(1.2, tz));
            return;
          }

          p.yawDeg += dx * 0.25;
          p.pitchDeg = Math.max(-50, Math.min(45, p.pitchDeg + dy * 0.18));
        };

        const end = () => {
          dragging = false;
          panning = false;
        };
        renderer.domElement.onpointerup = end;
        renderer.domElement.onpointercancel = end;

        renderer.domElement.onwheel = (e: WheelEvent) => {
          e.preventDefault();
          const p = cameraParamsRef.current;
          const next = p.distance + e.deltaY * 0.0012;
          p.distance = Math.max(0.65, Math.min(4.5, next));
        };

        // Disable context menu (right-drag panning).
        (renderer.domElement as any).oncontextmenu = (e: MouseEvent) => {
          e.preventDefault();
          return false;
        };
      } catch {
        // ignore
      }
    })().catch((e) => {
      if (cancelled) return;
      setStatus("error");
      setErrorText(e instanceof Error ? e.message : "Failed to init viewer");
    });

    return () => {
      cancelled = true;
      cleanup?.();
      cleanup = null;
    };
  }, [normalizedUrl]);

  return (
    <div
      className={className}
      style={{ position: "relative", overflow: "hidden" }}
    >
      <div ref={hostRef} className="h-full w-full" />

      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10 text-xs text-white/70">
          <div className="rounded-md bg-black/40 px-3 py-2 backdrop-blur">
            {status === "loading"
              ? "Loading VRM…"
              : errorText
                ? `VRM error: ${errorText}`
                : "VRM not ready"}
          </div>
        </div>
      )}

      {debugEnabled && debugText && (
        <div className="pointer-events-none absolute left-2 top-2 max-h-[90%] w-[min(720px,92%)] overflow-auto rounded-md bg-black/55 p-3 text-[11px] leading-relaxed text-white/90 backdrop-blur">
          {scanText ? <div className="mb-2 text-white/80">{scanText}</div> : null}
          <pre className="whitespace-pre-wrap">{debugText}</pre>
        </div>
      )}
    </div>
  );
}
