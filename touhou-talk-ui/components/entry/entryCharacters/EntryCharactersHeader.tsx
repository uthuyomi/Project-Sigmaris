export default function EntryCharactersHeader() {
  return (
    <section className="mx-auto mt-10 w-full max-w-6xl">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-wide">キャラクター一覧</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ロケーション別に一覧表示しています。気になるカードからお選びください。
          </p>
        </div>
        <a
          href="#entry-hero"
          className="text-sm font-medium text-primary hover:opacity-80"
        >
          ページ上部へ
        </a>
      </div>
    </section>
  );
}

