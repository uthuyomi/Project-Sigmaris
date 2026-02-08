"use client";

import { useEffect, useState } from "react";

export default function AccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account/info");
        const data = await res.json();
        setEmail(data?.user?.email ?? null);
      } catch (err) {
        console.error("Account info fetch failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">Account</h1>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
        <p className="text-gray-300">
          Email: <span className="text-blue-400">{email ?? "—"}</span>
        </p>
        <p className="text-gray-500 text-sm mt-2">
          Billing/Credits are disabled in this build.
        </p>
      </div>
    </div>
  );
}

