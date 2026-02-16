import Link from "next/link";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Terms</h1>
        <p className="mt-4 text-sm text-white/70">
          This is a minimal template for public release. Please customize it for
          your actual operation.
        </p>

        <section className="mt-8 space-y-3 text-sm text-white/80">
          <p>
            The service is provided as-is. Availability and correctness are not
            guaranteed.
          </p>
          <p>
            You agree not to use the service for illegal purposes or to infringe
            on the rights of others.
          </p>
          <p>
            Features may change or be discontinued without notice.
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

