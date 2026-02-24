"use client";

import { useEffect, useState } from "react";

type Props = {
  visible: boolean;
  autoHideMs?: number;
  fadeMs?: number;
};

export default function FogOverlay({ visible, autoHideMs = 900, fadeMs = 650 }: Props) {
  const [show, setShow] = useState<boolean>(visible);
  const [hiding, setHiding] = useState<boolean>(false);

  useEffect(() => {
    if (!visible) {
      setShow(false);
      setHiding(false);
      return;
    }

    setShow(true);
    setHiding(false);

    const t1 = window.setTimeout(() => setHiding(true), Math.max(0, autoHideMs));
    const t2 = window.setTimeout(
      () => setShow(false),
      Math.max(0, autoHideMs) + Math.max(0, fadeMs),
    );

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [visible, autoHideMs, fadeMs]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden pointer-events-none transition-opacity"
      style={{ opacity: hiding ? 0 : 1, transitionDuration: `${fadeMs}ms` }}
    >
      {/* ベース暗転 */}
      <div className="absolute inset-0 bg-black/30" />

      {/* 霧レイヤー①（奥） */}
      <div
        className="
          absolute inset-[-20%]
          opacity-60
          blur-2xl
          animate-fog-slow
        "
        style={{
          background:
            "radial-gradient(circle at 30% 40%, rgba(255,255,255,0.35), transparent 60%),\
             radial-gradient(circle at 70% 60%, rgba(255,255,255,0.25), transparent 65%),\
             radial-gradient(circle at 50% 80%, rgba(255,255,255,0.2), transparent 70%)",
        }}
      />

      {/* 霧レイヤー②（手前） */}
      <div
        className="
          absolute inset-[-30%]
          opacity-70
          blur-3xl
          animate-fog-fast
        "
        style={{
          background:
            "radial-gradient(circle at 40% 50%, rgba(255,255,255,0.45), transparent 55%),\
             radial-gradient(circle at 60% 40%, rgba(255,255,255,0.3), transparent 60%)",
        }}
      />

      {/* 全体ぼかし（雲中感） */}
      <div className="absolute inset-0 backdrop-blur-lg" />
    </div>
  );
}
