import Link from "next/link";

export default function EntryFooter() {
  return (
    <footer className="mx-auto mt-14 w-full max-w-6xl border-t border-border py-10 text-muted-foreground">
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div>
          <div className="text-sm font-semibold text-foreground">順次追加</div>
          <div className="mt-3 text-sm leading-relaxed">
            アバター画像と内部設定が揃い次第、選択できるキャラクターを順次追加します。
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-foreground">
            不具合報告・要望
          </div>
          <div className="mt-3 text-sm leading-relaxed">
            不具合やご要望は X(旧Twitter)　または　GitHub Issues までお知らせください。
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="https://github.com/uthuyomi/sigmaris-project/issues"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground hover:bg-secondary/80"
            >
              GitHub Issues
            </a>
            <a
              href="https://x.com/Oyasu1999"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground hover:bg-secondary/80"
            >
              X (旧Twitter)
            </a>
            <Link
              href="/legal/terms"
              className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground hover:bg-secondary/80"
            >
              利用規約
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>Copyright © {new Date().getFullYear()} Touhou Talk</div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/legal/privacy" className="hover:text-foreground/80">
            プライバシー
          </Link>
          <Link href="/legal/terms" className="hover:text-foreground/80">
            利用規約
          </Link>
        </div>
      </div>
    </footer>
  );
}

