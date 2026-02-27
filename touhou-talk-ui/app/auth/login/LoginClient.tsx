"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import TopShell from "@/components/top/TopShell";
import { SiDiscord, SiGithub, SiGoogle } from "react-icons/si";
import EntryTouhouBackground from "@/app/entry/EntryTouhouBackground";
import styles from "@/app/entry/entry-theme.module.css";

type Provider = "google" | "github" | "discord";

const providerIcon: Record<
  Provider,
  React.ComponentType<{ className?: string; size?: number }>
> = {
  google: SiGoogle,
  github: SiGithub,
  discord: SiDiscord,
};

function safeNextPath(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!s.startsWith("/")) return "";
  if (s.startsWith("//")) return "";
  if (s.includes("://")) return "";
  return s.length > 2048 ? s.slice(0, 2048) : s;
}

export default function LoginClient(props: { nextPath?: string | null }) {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = React.useState<Provider | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  async function signInWithOAuth(provider: Provider) {
    if (loadingProvider) return;
    setError(null);
    setLoadingProvider(provider);

    const nextSafe = safeNextPath(props.nextPath);

    const options: Record<string, any> = {
      redirectTo: `${window.location.origin}/auth/callback${
        nextSafe ? `?next=${encodeURIComponent(nextSafe)}` : ""
      }`,
    };
    if (provider === "google") {
      options.queryParams = {
        prompt: "select_account",
        access_type: "offline",
        response_type: "code",
      };
    }

    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options,
    });

    if (error) setError(error.message);
    setLoadingProvider(null);
  }

  const providers: Array<{ id: Provider; label: string }> = [
    { id: "google", label: "Googleでログイン" },
    { id: "github", label: "GitHubでログイン" },
    { id: "discord", label: "Discordでログイン" },
  ];

  return (
    <TopShell
      scroll
      backgroundVariant="none"
      backgroundSlot={<EntryTouhouBackground />}
      className={`${styles.entryTheme} bg-background text-foreground`}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card/85 p-6 text-card-foreground shadow-sm backdrop-blur">
        <h1 className="mb-4 text-lg font-semibold tracking-wide">ログイン</h1>

        <p className="mb-4 text-sm text-muted-foreground">
          Supabase Auth の OAuth でログインします。
        </p>
        {props.nextPath ? (
          <p className="mb-4 text-xs text-muted-foreground">
            ログイン後、元のページに戻ります。
          </p>
        ) : null}

        {error && (
          <p className="mb-2 text-sm text-destructive">{error}</p>
        )}

        <div className="grid gap-2">
          {providers.map(({ id, label }) => {
            const Icon = providerIcon[id];
            const isLoading = loadingProvider === id;
            return (
              <button
                key={id}
                onClick={() => signInWithOAuth(id)}
                disabled={Boolean(loadingProvider)}
                className={
                  id === "google"
                    ? "flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-50"
                    : "flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-secondary-foreground shadow-sm disabled:opacity-50 hover:bg-secondary/80"
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span>{isLoading ? "リダイレクト中…" : label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => router.push("/")}
          className="mt-4 text-xs text-muted-foreground hover:text-foreground"
        >
          戻る
        </button>
      </div>
    </TopShell>
  );
}
