"use client";

import Image from "next/image";

import FogOverlay from "@/components/top/FogOverlay";
import YinYangLoader from "@/components/top/YinYangLoader";

type Props = {
  children: React.ReactNode;
  fog?: boolean;
  loading?: boolean;
  scroll?: boolean;
  backgroundVariant?: "top" | "none";
  backgroundSlot?: React.ReactNode;
  className?: string;
};

export default function TopShell({
  children,
  fog = false,
  loading = false,
  scroll = false,
  backgroundVariant = "top",
  backgroundSlot,
  className,
}: Props) {
  const bgPos = scroll ? "fixed" : "absolute";

  return (
    <main
      className={
        (scroll
          ? "relative min-h-dvh w-full overflow-y-auto"
          : "relative h-dvh w-full overflow-hidden") + (className ? ` ${className}` : "")
      }
    >
      {backgroundVariant === "top" ? (
        <video
          className={`${bgPos} inset-0 m-auto hidden h-full object-cover lg:block`}
          src="/top/top-pc.mp4"
          autoPlay
          muted
          playsInline
        />
      ) : null}

      {backgroundVariant === "top" ? (
        <div className={`${bgPos} inset-0 lg:hidden`}>
          <Image
            src="/top/top-sp.png"
            alt="幻想郷の導入画面"
            fill
            priority
            className="object-cover"
          />
        </div>
      ) : null}

      {backgroundSlot}

      <div
        className={
          scroll
            ? "relative z-10 flex min-h-dvh flex-col items-center justify-start px-6 py-10"
            : "relative z-10 flex h-full flex-col items-center justify-center px-6"
        }
      >
        {children}
      </div>

      <FogOverlay visible={fog} />
      <YinYangLoader visible={loading} />
    </main>
  );
}
