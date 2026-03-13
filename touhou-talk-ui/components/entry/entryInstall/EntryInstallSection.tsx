import Link from "next/link";

import PwaInstallButton from "@/components/pwa/PwaInstallButton";
import { Button } from "@/components/ui/button";

const DESKTOP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ??
  "https://github.com/uthuyomi/Project-Sigmaris/releases/tag/touhou-talk-desktop-v0.1.1";
const DESKTOP_DOWNLOAD_LABEL =
  process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_LABEL ?? "Windows版（Electron）をダウンロード";

export default function EntryInstallSection() {
  return (
    <section
      id="entry-install"
      data-entry-section="install"
      className="mx-auto mt-10 w-full max-w-6xl space-y-3"
    >
      <h2 className="text-xl font-semibold tracking-wide">ホームに追加</h2>
      <p className="text-sm text-muted-foreground">
        スマートフォンやPCのホームに追加しておくと、次回からすぐに起動できます。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <PwaInstallButton />
        <Button asChild variant="secondary">
          <Link href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer">
            {DESKTOP_DOWNLOAD_LABEL}
          </Link>
        </Button>
      </div>
    </section>
  );
}
