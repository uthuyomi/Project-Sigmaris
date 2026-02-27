import Link from "next/link";

import TopShell from "@/components/top/TopShell";
import EntryTouhouBackground from "../../entry/EntryTouhouBackground";
import styles from "../../entry/entry-theme.module.css";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <TopShell
      scroll
      backgroundVariant="none"
      backgroundSlot={<EntryTouhouBackground />}
      className={`${styles.entryTheme} bg-background text-foreground`}
    >
      <div className="w-full max-w-3xl">
        <div className="rounded-3xl border border-border bg-card/85 p-6 shadow-sm backdrop-blur sm:p-8">
          <h1 className="text-2xl font-semibold tracking-wide">
            プライバシーポリシー
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            本ページは公開用の最低限の雛形です。運用に合わせて必ず調整してください。
          </p>

          <section className="mt-8 space-y-3 text-sm text-muted-foreground">
            <p>
              本アプリは、ログイン（Supabase Auth）および会話の保存のためにユーザーID等の情報を取り扱います。
            </p>
            <p>
              会話内容・添付ファイル・リンク解析結果などは、ユーザー体験の提供および不具合対応のために保存される場合があります。
            </p>
            <p>
              取得した情報は、第三者への販売・不当な共有を行いません（ただし法令に基づく場合を除く）。
            </p>
          </section>

          <div className="mt-10">
            <Link
              href="/"
              className="text-sm font-medium text-primary hover:opacity-80"
            >
              ← 戻る
            </Link>
          </div>
        </div>
      </div>
    </TopShell>
  );
}
