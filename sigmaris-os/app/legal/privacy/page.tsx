import Link from "next/link";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Privacy Policy</h1>
        <p className="mt-4 text-sm text-white/70">
          This is a minimal template for public release. Please customize it for
          your actual operation.
        </p>

        <section className="mt-8 space-y-3 text-sm text-white/80">
          <p>
            Sigmaris OS uses Supabase Auth for login. We may process identifiers
            (e.g. user ID, email) to maintain sessions.
          </p>
          <p>
            Conversation metadata may be stored for providing features and for
            debugging. The app is designed to be privacy-safe where possible.
          </p>
          <p>
            We do not sell personal data. Data may be disclosed only when
            required by law.
          </p>
        </section>

        <div className="mt-10">
          <Link href="/home" className="text-sm text-white/70 hover:text-white">
            ← Back
          </Link>
        </div>
      </div>
    </main>
  );
}

