"use client";

import { useEffect, useMemo, useRef } from "react";

function useReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return true;
    return (
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    );
  }, []);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
type Rgb = { r: number; g: number; b: number };

function parseRgb(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  const m =
    s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/) ||
    s.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b))
    return null;
  return { r, g, b };
}

function toGlColor(c: Rgb) {
  return { r: c.r / 255, g: c.g / 255, b: c.b / 255 };
}

export default function EntryDanmakuWebGL() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorProbeRef = useRef<HTMLSpanElement | null>(null);
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return null;

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const canvas = canvasEl;
    const probe = colorProbeRef.current;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) return;
    const glCtx = gl;

    // ---------- utils ----------
    function createShader(type: number, src: string) {
      const sh = glCtx.createShader(type);
      if (!sh) throw new Error("createShader failed");
      glCtx.shaderSource(sh, src);
      glCtx.compileShader(sh);
      if (!glCtx.getShaderParameter(sh, glCtx.COMPILE_STATUS)) {
        const log = glCtx.getShaderInfoLog(sh) || "shader compile failed";
        glCtx.deleteShader(sh);
        throw new Error(log);
      }
      return sh;
    }

    function createProgram(vsSrc: string, fsSrc: string) {
      const p = glCtx.createProgram();
      if (!p) throw new Error("createProgram failed");
      const vs = createShader(glCtx.VERTEX_SHADER, vsSrc);
      const fs = createShader(glCtx.FRAGMENT_SHADER, fsSrc);
      glCtx.attachShader(p, vs);
      glCtx.attachShader(p, fs);
      glCtx.linkProgram(p);
      glCtx.deleteShader(vs);
      glCtx.deleteShader(fs);
      if (!glCtx.getProgramParameter(p, glCtx.LINK_STATUS)) {
        const log = glCtx.getProgramInfoLog(p) || "program link failed";
        glCtx.deleteProgram(p);
        throw new Error(log);
      }
      return p;
    }

    const cssNumber = (name: string, fallback: number) => {
      const raw = getComputedStyle(canvas).getPropertyValue(name).trim();
      const n = Number.parseFloat(raw);
      return Number.isFinite(n) ? n : fallback;
    };

    const intensity = clamp(cssNumber("--entry-danmaku-intensity", 1), 0.25, 3);
    const clearAlpha = clamp(cssNumber("--entry-danmaku-clear-alpha", 0), 0, 1);
    const additive = cssNumber("--entry-danmaku-additive", 0) >= 0.5;

    // ---------- palette (3 colors) ----------
    // oklch() をWebGLに直接渡せないので、computed rgb をプローブ要素から拾う。
    const palette = (() => {
      if (!probe) {
        return {
          c1: { r: 1, g: 1, b: 1 }, // white
          c2: { r: 0.70, g: 0.95, b: 1.0 }, // cyan-ish
          c3: { r: 1.0, g: 0.62, b: 0.78 }, // pink-ish
        };
      }
      const s = getComputedStyle(probe);
      const c1rgb = parseRgb(s.color) ?? { r: 255, g: 255, b: 255 };
      const c2rgb = parseRgb(s.backgroundColor) ?? c1rgb;
      const c3rgb = parseRgb(s.borderTopColor) ?? c1rgb;
      return {
        c1: toGlColor(c1rgb),
        c2: toGlColor(c2rgb),
        c3: toGlColor(c3rgb),
      };
    })();

    // ---------- shaders ----------
    // quad (2D) as triangle strip: (-1,-1) (1,-1) (-1,1) (1,1)
    const VS = `#version 300 es
      precision highp float;

      layout(location=0) in vec2 aQuad;
      layout(location=1) in vec2 iPos;       // px
      layout(location=2) in float iR;        // px
      layout(location=3) in vec4 iColor;     // rgba

      uniform vec2 uRes; // canvas size in px

      out vec2 vLocal;
      out vec4 vColor;

      void main() {
        vLocal = aQuad;
        vColor = iColor;

        vec2 p = iPos + aQuad * iR;
        vec2 ndc = (p / uRes) * 2.0 - 1.0;
        ndc.y *= -1.0;
        gl_Position = vec4(ndc, 0.0, 1.0);
      }
    `;

    const FS = `#version 300 es
      precision highp float;

      in vec2 vLocal;
      in vec4 vColor;
      out vec4 outColor;

      void main() {
        float d = length(vLocal);
        float alpha = smoothstep(1.05, 0.85, d);
        float core = smoothstep(0.6, 0.0, d);
        vec3 col = vColor.rgb + core * 0.15;
        outColor = vec4(col, vColor.a * alpha);
        if (alpha < 0.01) discard;
      }
    `;

    const prog = createProgram(VS, FS);
    glCtx.useProgram(prog);

    const uRes = glCtx.getUniformLocation(prog, "uRes");

    // ---------- buffers / VAO ----------
    const vao = glCtx.createVertexArray();
    glCtx.bindVertexArray(vao);

    const quad = glCtx.createBuffer();
    if (!quad) return;
    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, quad);
    glCtx.bufferData(
      glCtx.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      glCtx.STATIC_DRAW,
    );
    glCtx.enableVertexAttribArray(0);
    glCtx.vertexAttribPointer(0, 2, glCtx.FLOAT, false, 0, 0);

    const bPos = glCtx.createBuffer();
    const bR = glCtx.createBuffer();
    const bCol = glCtx.createBuffer();
    if (!bPos || !bR || !bCol) return;

    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, bPos);
    glCtx.enableVertexAttribArray(1);
    glCtx.vertexAttribPointer(1, 2, glCtx.FLOAT, false, 0, 0);
    glCtx.vertexAttribDivisor(1, 1);

    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, bR);
    glCtx.enableVertexAttribArray(2);
    glCtx.vertexAttribPointer(2, 1, glCtx.FLOAT, false, 0, 0);
    glCtx.vertexAttribDivisor(2, 1);

    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, bCol);
    glCtx.enableVertexAttribArray(3);
    glCtx.vertexAttribPointer(3, 4, glCtx.FLOAT, false, 0, 0);
    glCtx.vertexAttribDivisor(3, 1);

    glCtx.bindVertexArray(null);

    // ---------- bullet simulation (CPU) ----------
    const MAX = Math.round(clamp(45000 * intensity, 12000, 65000));
    const px = new Float32Array(MAX);
    const py = new Float32Array(MAX);
    const vx = new Float32Array(MAX);
    const vy = new Float32Array(MAX);
    const life = new Float32Array(MAX);
    const rad = new Float32Array(MAX);
    const cr = new Float32Array(MAX);
    const cg = new Float32Array(MAX);
    const cb = new Float32Array(MAX);
    const ca = new Float32Array(MAX);
    const active = new Uint8Array(MAX);

    const free = new Uint32Array(MAX);
    let freeTop = MAX;
    for (let i = 0; i < MAX; i++) free[i] = i;

    let alive = 0;

    function alloc(): number {
      if (freeTop <= 0) return -1;
      freeTop--;
      const idx = free[freeTop]!;
      active[idx] = 1;
      alive++;
      return idx;
    }

    function kill(i: number) {
      if (!active[i]) return;
      active[i] = 0;
      alive--;
      free[freeTop] = i;
      freeTop++;
    }

    function spawn(
      x: number,
      y: number,
      vxx: number,
      vyy: number,
      ttl: number,
      r: number,
      rC: number,
      gC: number,
      bC: number,
      aC: number,
    ) {
      const i = alloc();
      if (i < 0) return false;
      px[i] = x;
      py[i] = y;
      vx[i] = vxx;
      vy[i] = vyy;
      life[i] = ttl;
      rad[i] = r;
      cr[i] = rC;
      cg[i] = gC;
      cb[i] = bC;
      ca[i] = aC;
      return true;
    }

    // ---------- render instance packing buffers ----------
    const packPos = new Float32Array(MAX * 2);
    const packR = new Float32Array(MAX);
    const packCol = new Float32Array(MAX * 4);

    // ---------- resize / DPR ----------
    let W = 0,
      H = 0,
      DPR = 1;
    function resize() {
      DPR = clamp(window.devicePixelRatio || 1, 1, 2);
      W = Math.floor(window.innerWidth * DPR);
      H = Math.floor(window.innerHeight * DPR);
      canvas.width = W;
      canvas.height = H;
      glCtx.viewport(0, 0, W, H);
    }
    window.addEventListener("resize", resize, { passive: true });
    resize();

    // ---------- blend / clear ----------
    glCtx.disable(glCtx.DEPTH_TEST);
    glCtx.enable(glCtx.BLEND);
    // additiveだと密度が高い時に白飛びしやすいので、既定はalpha合成にして色が見えるようにする
    glCtx.blendFunc(
      glCtx.SRC_ALPHA,
      additive ? glCtx.ONE : glCtx.ONE_MINUS_SRC_ALPHA,
    );

    // pointer連動は直線列（帯）を作りやすいので使わない

    // ---------- patterns (emitters) ----------
    let t = 0;
    let spawnBudget = 2200 * intensity; // bullets/sec baseline; auto-adjust
    let fps = 60;

    function emit(dt: number) {
      t += dt;

      const cx = (W / DPR) * 0.5;
      const cy = (H / DPR) * 0.5;

      // 1) Spiral (continuous)
      {
        const rate = spawnBudget * 0.55;
        const n = Math.floor(rate * dt);
        for (let k = 0; k < n; k++) {
          const phase = t * 2.7 + k * 0.14;
          const wob = Math.sin(t * 2.1) * 0.35;
          const a = phase + wob;

          const speed = 110 + 60 * Math.sin(t * 1.6);
          const vxx = Math.cos(a) * speed;
          const vyy = Math.sin(a) * speed;

          const r = 2.0 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4.0));
          spawn(
            cx,
            cy,
            vxx,
            vyy,
            6.2,
            r,
            palette.c2.r,
            palette.c2.g,
            palette.c2.b,
            0.85,
          );
        }
      }

      // 直線列になりやすいパターン（狙い弾/広域リング）は削除。円弾の渦だけ残す。
    }

    // ---------- animation loop ----------
    let raf = 0;
    let last = performance.now();
    let accFrames = 0;
    let accTime = 0;

    const onVisibility = () => {
      if (!document.hidden && !raf) raf = requestAnimationFrame(step);
    };
    document.addEventListener("visibilitychange", onVisibility);

    function step(now: number) {
      raf = 0;

      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      // FPS monitor (1s)
      accTime += dt;
      accFrames++;
      if (accTime >= 1.0) {
        fps = accFrames / accTime;
        accTime = 0;
        accFrames = 0;

        if (fps < 50) spawnBudget *= 0.88;
        else if (fps > 58) spawnBudget *= 1.04;
        spawnBudget = clamp(spawnBudget, 600 * intensity, 6000 * intensity);
      }

      emit(dt);

      const wCss = W / DPR;
      const hCss = H / DPR;

      let count = 0;
      for (let i = 0; i < MAX; i++) {
        if (!active[i]) continue;

        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        life[i] -= dt;

        // 蛇行（曲がり）を作る微小カーブは無しにする

        const r = rad[i];
        if (
          life[i] <= 0 ||
          px[i] < -40 - r ||
          px[i] > wCss + 40 + r ||
          py[i] < -40 - r ||
          py[i] > hCss + 40 + r
        ) {
          kill(i);
          continue;
        }

        const bi = count++;
        packPos[bi * 2 + 0] = px[i] * DPR;
        packPos[bi * 2 + 1] = py[i] * DPR;
        packR[bi] = r * DPR;
        packCol[bi * 4 + 0] = cr[i];
        packCol[bi * 4 + 1] = cg[i];
        packCol[bi * 4 + 2] = cb[i];
        packCol[bi * 4 + 3] = ca[i];
      }

      glCtx.useProgram(prog);
      glCtx.uniform2f(uRes, W, H);

      // 残像（簡易）：黒を薄くクリア。背景が暗い想定なので破綻しにくい。
      glCtx.clearColor(0, 0, 0, clearAlpha);
      glCtx.clear(glCtx.COLOR_BUFFER_BIT);

      glCtx.bindVertexArray(vao);

      // upload only active portion (no subarray alloc)
      glCtx.bindBuffer(glCtx.ARRAY_BUFFER, bPos);
      glCtx.bufferData(glCtx.ARRAY_BUFFER, packPos.byteLength, glCtx.DYNAMIC_DRAW);
      glCtx.bufferSubData(glCtx.ARRAY_BUFFER, 0, packPos, 0, count * 2);

      glCtx.bindBuffer(glCtx.ARRAY_BUFFER, bR);
      glCtx.bufferData(glCtx.ARRAY_BUFFER, packR.byteLength, glCtx.DYNAMIC_DRAW);
      glCtx.bufferSubData(glCtx.ARRAY_BUFFER, 0, packR, 0, count);

      glCtx.bindBuffer(glCtx.ARRAY_BUFFER, bCol);
      glCtx.bufferData(glCtx.ARRAY_BUFFER, packCol.byteLength, glCtx.DYNAMIC_DRAW);
      glCtx.bufferSubData(glCtx.ARRAY_BUFFER, 0, packCol, 0, count * 4);

      glCtx.drawArraysInstanced(glCtx.TRIANGLE_STRIP, 0, 4, count);
      glCtx.bindVertexArray(null);

      if (!document.hidden) raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      glCtx.bindVertexArray(null);
      glCtx.useProgram(null);
      glCtx.deleteProgram(prog);
      glCtx.deleteBuffer(quad);
      glCtx.deleteBuffer(bPos);
      glCtx.deleteBuffer(bR);
      glCtx.deleteBuffer(bCol);
      glCtx.deleteVertexArray(vao);
    };
  }, []);

  return (
    <>
      <span
        ref={colorProbeRef}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] -top-[9999px] h-px w-px"
        style={{
          // 3色：foreground / primary / destructive（テーマ側を変えれば色も追従）
          color: "var(--foreground)",
          backgroundColor: "var(--primary)",
          borderTopColor: "var(--destructive)",
          borderTopStyle: "solid",
          borderTopWidth: 1,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: "var(--entry-danmaku-opacity, 1)",
        }}
      />
    </>
  );
}
