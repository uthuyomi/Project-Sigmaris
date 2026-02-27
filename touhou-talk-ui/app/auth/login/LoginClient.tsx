"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import TopShell from "@/components/top/TopShell";
import { SiDiscord, SiGithub, SiGoogle } from "react-icons/si";

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
    <TopShell>
      <div className="w-full max-w-sm rounded-xl bg-white/10 p-6 backdrop-blur text-white">
        <h1 className="mb-4 text-lg font-medium">ログイン</h1>

        <p className="mb-4 text-sm text-white/80">
          Supabase Auth の OAuth でログインします。
        </p>
        {props.nextPath ? (
          <p className="mb-4 text-xs text-white/60">
            ログイン後、元のページに戻ります。
          </p>
        ) : null}

        {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

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
                    ? "w-full rounded-lg bg-white px-4 py-2 text-sm text-black disabled:opacity-50 flex items-center justify-center gap-2"
                    : "w-full rounded-lg bg-white/90 px-4 py-2 text-sm text-black disabled:opacity-50 flex items-center justify-center gap-2"
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
          className="mt-4 text-xs text-white/60 hover:text-white"
        >
          戻る
        </button>
      </div>
    </TopShell>
  );
}

