import PwaInstallButton from "@/components/pwa/PwaInstallButton";

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
      <PwaInstallButton />
    </section>
  );
}

