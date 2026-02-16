import Link from "next/link";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-black text-white px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">利用規約</h1>
        <p className="mt-4 text-sm text-white/80">
          本ページは公開用の最低限の雛形です。運用に合わせて必ず調整してください。
        </p>

        <section className="mt-8 space-y-3 text-sm text-white/80">
          <p>
            本アプリは二次創作・プロトタイプとして提供されます。提供者は、本アプリの内容の正確性や継続提供を保証しません。
          </p>
          <p>
            ユーザーは、他者の権利を侵害する内容や法令に反する目的で本アプリを利用しないものとします。
          </p>
          <p>
            事前の通知なく、機能の変更・停止を行う場合があります。
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

