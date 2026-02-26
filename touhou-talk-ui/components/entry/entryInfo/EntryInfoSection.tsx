export default function EntryInfoSection() {
  return (
    <section
      id="entry-info"
      data-entry-section="info"
      className="mx-auto mt-10 w-full max-w-6xl space-y-4"
    >
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-wide">はじめに</h2>
        <p className="text-sm text-muted-foreground">
          迷わず開始できるよう、要点をまとめました。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <div className="text-sm font-semibold">遊び方</div>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>1. キャラクターを選択</li>
            <li>2. ログイン</li>
            <li>3. 会話を開始</li>
          </ol>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <div className="text-sm font-semibold">ロールプレイ方針</div>
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
            口調や雰囲気の再現を優先します。キャラクターごとに距離感やテンポが異なるため、相性の良い相手をお試しください。
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <div className="text-sm font-semibold">推奨環境</div>
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
            PC / タブレット / スマートフォンに対応しています。Chrome / Safari
            の最新版を推奨します。
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <div className="text-sm font-semibold">運営について</div>
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
            本サービスは個人の負担で運営しております。混雑状況により、一時的に提供を停止する場合がございます。あらかじめご了承ください。
          </div>
        </div>
      </div>
    </section>
  );
}

