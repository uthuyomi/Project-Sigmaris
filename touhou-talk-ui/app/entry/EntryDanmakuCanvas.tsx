"use client";

import { useEffect, useMemo, useRef } from "react";

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

function rgba(c: Rgb, a: number) {
  const alpha = Math.max(0, Math.min(1, a));
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function useReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);
}

type Bullet = {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  color: Rgb;
  stroke: boolean;
};

type Laser = {
  x: number;
  y: number;
  a: number;
  len: number;
  w: number;
  life: number;
  maxLife: number;
  color: Rgb;
};

export default function EntryDanmakuCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorProbeRef = useRef<HTMLSpanElement | null>(null);
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return null;

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const canvas = canvasEl;

    const ctxEl = canvas.getContext("2d");
    if (!ctxEl) return;
    const ctx = ctxEl;

    let running = true;
    let raf = 0;

    const bullets: Bullet[] = [];
    const lasers: Laser[] = [];
    let maxBullets = 1200;
    const dprCap = 1.75;
    const intensity = (() => {
      const raw = getComputedStyle(canvas).getPropertyValue("--entry-danmaku-intensity");
      const n = Number.parseFloat(String(raw).trim());
      if (!Number.isFinite(n)) return 1;
      return Math.max(0.25, Math.min(3, n));
    })();

    const resolved = (() => {
      const probe = colorProbeRef.current;
      if (!probe) return null;
      const s = getComputedStyle(probe);
      const primary = parseRgb(s.color);
      const accent = parseRgb(s.backgroundColor) ?? primary;
      const destructive = parseRgb(s.borderTopColor) ?? primary;
      const background = parseRgb(s.outlineColor) ?? { r: 250, g: 247, b: 236 };
      if (!primary) return null;
      return {
        primary,
        accent: accent ?? primary,
        destructive: destructive ?? primary,
        background,
      };
    })();

    const palette = resolved ?? {
      primary: { r: 70, g: 120, b: 220 },
      accent: { r: 90, g: 200, b: 200 },
      destructive: { r: 220, g: 80, b: 80 },
      background: { r: 250, g: 247, b: 236 },
    };

    function resize() {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? window.innerWidth;
      const h = parent?.clientHeight ?? window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);

      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = Math.max(1, w * h);
      maxBullets = Math.round(Math.max(900, Math.min(2600, (area / (920 * 920)) * 1700)) * intensity);
    }

    const onVisibility = () => {
      const hidden = typeof document !== "undefined" && document.hidden;
      running = !hidden;
      if (running && !raf) {
        lastT = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    function pushBullet(b: Omit<Bullet, "px" | "py">) {
      bullets.push({ ...b, px: b.x, py: b.y });
    }

    function spawnFan(nowSec: number, cx: number, cy: number, dir: number) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const base = nowSec * 0.9 * dir;

      const count = Math.round(26 * intensity);
      const spread = 1.28;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const a = base + (t - 0.5) * spread + Math.sin(nowSec * 0.8) * 0.08;
        const speed = rand(90, 185);
        const radius = rand(2.4, 4.9);
        const maxLife = rand(7.0, 12.0);
        const pick = Math.random();
        const color =
          pick < 0.62 ? palette.primary : pick < 0.92 ? palette.accent : palette.destructive;
        const stroke = Math.random() < 0.55;

        pushBullet({
          x: clamp(cx + rand(-10, 10), 0, w),
          y: clamp(cy + rand(-8, 8), 0, h),
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          r: radius,
          life: maxLife,
          maxLife,
          color,
          stroke,
        });
      }
    }

    function spawnRing(nowSec: number, cx: number, cy: number) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const base = nowSec * 0.8;
      const count = Math.round(56 * intensity);
      for (let i = 0; i < count; i++) {
        const a = base + (i / count) * Math.PI * 2;
        const speed = rand(48, 96);
        const radius = rand(1.9, 4.0);
        const maxLife = rand(10.0, 16.0);
        const color = i % 3 === 0 ? palette.accent : palette.primary;
        pushBullet({
          x: clamp(cx, 0, w),
          y: clamp(cy, 0, h),
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          r: radius,
          life: maxLife,
          maxLife,
          color,
          stroke: true,
        });
      }
    }

    function spawnSpiral(nowSec: number, cx: number, cy: number) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const base = nowSec * 2.1;
      const count = Math.round(34 * intensity);
      for (let i = 0; i < count; i++) {
        const a = base + i * 0.23 + Math.sin(nowSec * 0.7) * 0.10;
        const speed = rand(72, 150);
        const radius = rand(2.0, 4.1);
        const maxLife = rand(10.0, 16.0);
        const color = i % 4 === 0 ? palette.accent : palette.primary;
        pushBullet({
          x: clamp(cx + rand(-6, 6), 0, w),
          y: clamp(cy + rand(-6, 6), 0, h),
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          r: radius,
          life: maxLife,
          maxLife,
          color,
          stroke: Math.random() < 0.75,
        });
      }
    }

    function spawnLaserBurst(nowSec: number) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w * 0.5;
      const cy = h * 0.45;
      const base = nowSec * 0.55;
      const count = Math.round(5 * intensity);
      for (let i = 0; i < count; i++) {
        const a = base + (i - 1) * 0.22;
        const color = i === 1 ? palette.accent : palette.primary;
        lasers.push({
          x: cx,
          y: cy,
          a,
          len: Math.max(w, h) * rand(0.8, 1.15),
          w: rand(2.2, 4.0),
          life: rand(0.55, 0.95),
          maxLife: rand(0.55, 0.95),
          color,
        });
      }
    }

    let spawnAcc = 0;
    let ringAcc = 0;
    let spiralAcc = 0;
    let laserAcc = 0;
    let lastT = performance.now();
    let lastDraw = lastT;

    function tick(now: number) {
      raf = 0;
      if (!running) return;

      // 30fps程度に抑える（背景なので軽めに）
      if (now - lastDraw < 33) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastDraw = now;

      const dt = clamp((now - lastT) / 1000, 0, 0.05);
      lastT = now;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const nowSec = now / 1000;

      // Spawn (throttled)
      spawnAcc += dt;
      ringAcc += dt;
      spiralAcc += dt;
      laserAcc += dt;

      while (spawnAcc > 0.022) {
        spawnAcc -= 0.022;
        if (bullets.length < maxBullets) {
          spawnFan(nowSec, w * 0.5, h * 0.44, 1);
          spawnFan(nowSec, w * 0.18, h * 0.20, -1);
          spawnFan(nowSec, w * 0.82, h * 0.22, 1);
        }
      }
      while (ringAcc > 0.24) {
        ringAcc -= 0.24;
        if (bullets.length < maxBullets - 30) {
          spawnRing(nowSec, w * 0.5, h * 0.74);
        }
      }
      while (spiralAcc > 0.065) {
        spiralAcc -= 0.065;
        if (bullets.length < maxBullets - 40) {
          spawnSpiral(nowSec, w * 0.5, h * 0.50);
        }
      }
      while (laserAcc > 0.62) {
        laserAcc -= 0.62;
        if (lasers.length < 8) spawnLaserBurst(nowSec);
      }

      // Update
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i]!;
        b.px = b.x;
        b.py = b.y;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;

        const out =
          b.x < -40 || b.x > w + 40 || b.y < -40 || b.y > h + 40 || b.life <= 0;
        if (out) bullets.splice(i, 1);
      }

      for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i]!;
        l.life -= dt;
        if (l.life <= 0) lasers.splice(i, 1);
      }

      // Draw
      ctx.globalCompositeOperation = "source-over";
      // 残像を残しつつ “白弾幕” を沈ませない程度に
      ctx.fillStyle = rgba(palette.background, 0.10);
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const b of bullets) {
        const t = 1 - b.life / b.maxLife;
        const fadeIn = clamp(t / 0.12, 0, 1);
        const fadeOut = clamp((1 - t) / 0.22, 0, 1);
        const a = 0.95 * fadeIn * fadeOut;

        // trail
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(b.px, b.py);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = rgba(b.color, a * 0.85);
        ctx.stroke();

        // body (diamond-ish) + glow
        const rr = b.r * 1.2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, rr * 2.15, 0, Math.PI * 2);
        ctx.fillStyle = rgba(b.color, a * 0.22);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(b.x, b.y - rr);
        ctx.lineTo(b.x + rr, b.y);
        ctx.lineTo(b.x, b.y + rr);
        ctx.lineTo(b.x - rr, b.y);
        ctx.closePath();
        if (b.stroke) {
          ctx.lineWidth = 2.0;
          ctx.strokeStyle = rgba(b.color, a);
          ctx.stroke();
        } else {
          ctx.fillStyle = rgba(b.color, a * 0.92);
          ctx.fill();
        }
      }

      for (const l of lasers) {
        const t = 1 - l.life / l.maxLife;
        const fadeIn = clamp(t / 0.20, 0, 1);
        const fadeOut = clamp((1 - t) / 0.35, 0, 1);
        const a = 0.72 * fadeIn * fadeOut;

        const x2 = l.x + Math.cos(l.a) * l.len;
        const y2 = l.y + Math.sin(l.a) * l.len;

        const grad = ctx.createLinearGradient(l.x, l.y, x2, y2);
        grad.addColorStop(0, rgba(l.color, a * 0.0));
        grad.addColorStop(0.2, rgba(l.color, a * 0.65));
        grad.addColorStop(0.8, rgba(l.color, a * 0.65));
        grad.addColorStop(1, rgba(l.color, a * 0.0));

        ctx.lineWidth = l.w;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = grad;
        ctx.stroke();
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      <span
        ref={colorProbeRef}
        aria-hidden
        className="pointer-events-none absolute -left-[9999px] -top-[9999px] h-px w-px"
        style={{
          // Canvasは oklch() を直接扱えないので、computed rgb を拾うためのプローブ。
          // 弾幕は “白” を基調に見せたい
          color: "var(--foreground)",
          backgroundColor: "var(--foreground)",
          borderTopColor: "var(--foreground)",
          borderTopStyle: "solid",
          borderTopWidth: 1,
          outlineStyle: "solid",
          outlineWidth: 1,
          outlineColor: "var(--background)",
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
