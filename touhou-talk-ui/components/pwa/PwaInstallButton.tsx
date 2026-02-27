"use client";

import { useEffect, useMemo, useState } from "react";
import { FaAndroid, FaApple, FaWindows } from "react-icons/fa6";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iPhone = /iPhone/.test(ua);
  const iPad = /iPad/.test(ua) || (/(Macintosh)/.test(ua) && "ontouchend" in document);
  return iPhone || iPad;
}

function isAndroid() {
  if (typeof window === "undefined") return false;
  return /Android/i.test(window.navigator.userAgent);
}

function isWindows() {
  if (typeof window === "undefined") return false;
  return /Windows/i.test(window.navigator.userAgent);
}

function isMac() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iOS iPadOS Safari sometimes reports Macintosh; filter with touch check
  const isMacLike = /Macintosh/i.test(ua);
  const isTouch = "ontouchend" in document;
  return isMacLike && !isTouch;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  // iOS Safari
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav: any = window.navigator;
  if (typeof nav?.standalone === "boolean") return nav.standalone;
  // others
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

function OsButton({
  icon,
  label,
  description,
  disabled,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex w-full items-start gap-3 rounded-2xl border bg-card p-5 text-left shadow-sm transition-colors " +
        (disabled
          ? "cursor-not-allowed border-border opacity-60"
          : active
            ? "border-primary/35 bg-accent hover:bg-accent/80"
            : "border-border hover:border-primary/35 hover:bg-card/90")
      }
    >
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-secondary text-xl text-foreground/80">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold text-card-foreground">{label}</div>
          {active ? (
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              おすすめ
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

export default function PwaInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const ios = useMemo(() => isIOS(), []);
  const android = useMemo(() => isAndroid(), []);
  const windows = useMemo(() => isWindows(), []);
  const mac = useMemo(() => isMac(), []);

  useEffect(() => {
    setInstalled(isStandalone());
  }, []);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (installed) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(900px_560px_at_30%_10%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_60%),radial-gradient(900px_560px_at_80%_80%,oklch(1_0_0_/_0.14),transparent_62%)]" />

      <div className="relative">
        <div className="text-base font-semibold">ホームに追加して、1タップで起動</div>
        <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
          ショートカットを作成すると、すぐにチャットを開始できます。
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OsButton
          icon={<FaAndroid />}
          label="Android"
          description={
            deferred
              ? "ボタン1つでホーム画面に追加できます。"
              : "このブラウザでは表示されない場合があります（メニューから追加してください）。"
          }
          disabled={!deferred}
          active={android}
          onClick={
            deferred
              ? async () => {
                  const ev = deferred;
                  setDeferred(null);
                  await ev.prompt();
                  try {
                    await ev.userChoice;
                  } finally {
                    setInstalled(isStandalone());
                  }
                }
              : undefined
          }
        />

        <OsButton
          icon={<FaApple />}
          label="iPhone / iPad"
          description="共有メニューから「ホーム画面に追加」で作成できます。"
          disabled={!ios}
          active={ios}
          onClick={() => setShowIosHelp((v) => !v)}
        />

        <OsButton
          icon={<FaWindows />}
          label="Windows"
          description={
            deferred
              ? "ブラウザのインストール機能でデスクトップに追加できます。"
              : "このブラウザでは表示されない場合があります（メニューから追加してください）。"
          }
          disabled={!deferred}
          active={windows}
          onClick={
            deferred
              ? async () => {
                  const ev = deferred;
                  setDeferred(null);
                  await ev.prompt();
                  try {
                    await ev.userChoice;
                  } finally {
                    setInstalled(isStandalone());
                  }
                }
              : undefined
          }
        />

        <OsButton
          icon={<FaApple />}
          label="macOS"
          description={
            deferred
              ? "ブラウザのインストール機能でDock/Launchpadに追加できます。"
              : "ブラウザによっては未対応です（対応ブラウザではインストールが表示されます）。"
          }
          disabled={!deferred}
          active={mac}
          onClick={
            deferred
              ? async () => {
                  const ev = deferred;
                  setDeferred(null);
                  await ev.prompt();
                  try {
                    await ev.userChoice;
                  } finally {
                    setInstalled(isStandalone());
                  }
                }
              : undefined
          }
        />
      </div>

      {ios && showIosHelp ? (
        <div className="mt-4 rounded-2xl border border-border bg-secondary/60 p-4 text-sm text-muted-foreground">
          <div className="font-semibold text-card-foreground">iPhone/iPad 手順</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Safariでこのページを開く</li>
            <li>共有ボタンを押す</li>
            <li>「ホーム画面に追加」を選ぶ</li>
          </ol>
        </div>
      ) : null}

      {/* Context hint (no extra UI) */}
      <div className="mt-4 text-xs text-muted-foreground">
        {android
          ? "Android: Chrome/Edge推奨"
          : windows
            ? "Windows: Chrome/Edge推奨"
            : mac
              ? "macOS: Chromeが対応しやすいです（Safariは挙動が異なる場合があります）"
              : "環境によってはインストールが表示されない場合があります"}
      </div>
      </div>
    </div>
  );
}
