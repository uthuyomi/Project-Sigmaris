import TopShell from "@/components/top/TopShell";
import EntryStage from "./EntryStage";

export default function EntryPage() {
  return (
    <TopShell
      scroll
      backgroundVariant="none"
      backgroundSlot={<EntryStage />}
    >
      {/* スクロールは“切替トリガー”だけに使う（背景/カードは固定ステージで表示） */}
      <div className="w-full">
        <section
          id="entry-spacer-hero"
          data-entry-section="hero"
          className="h-dvh w-full"
        >
          <h2 className="sr-only">Hero</h2>
        </section>
        <section
          id="entry-spacer-gensokyo"
          data-entry-section="gensokyo"
          className="h-dvh w-full"
        >
          <h2 className="sr-only">幻想郷</h2>
        </section>
        <section
          id="entry-spacer-deep"
          data-entry-section="deep"
          className="h-dvh w-full"
        >
          <h2 className="sr-only">地底</h2>
        </section>
        <section
          id="entry-spacer-higan"
          data-entry-section="higan"
          className="h-dvh w-full"
        >
          <h2 className="sr-only">白玉楼</h2>
        </section>
      </div>
    </TopShell>
  );
}
