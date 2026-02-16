import Link from "next/link";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-black text-white px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
        <p className="mt-4 text-sm text-white/80">
          本ページは公開用の最低限の雛形です。運用に合わせて必ず調整してください。
        </p>

        <section className="mt-8 space-y-3 text-sm text-white/80">
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
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← 戻る
          </Link>
        </div>
      </div>
    </main>
  );
}

