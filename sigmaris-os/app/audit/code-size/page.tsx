"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { SigmarisLangProvider } from "@/lib/sigmarisLangContext";

type Bucket = {
  files: number;
  lines: number;
  byExt: Record<string, { files: number; lines: number }>;
};

type ProjectStats = {
  name: string;
  root: string;
  note?: string;
  total: Bucket;
  code: Bucket;
  docs: Bucket;
};

type CodeStatsResponse = {
  ok: boolean;
  generated_at: string;
  repo_root: string;
  options: {
    includeDocs: boolean;
    includeEngine: boolean;
    includeSupabaseSql: boolean;
  };
  excludes: { dirs: string[]; note: string };
  projects: ProjectStats[];
  error?: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function topExts(byExt: Bucket["byExt"], limit = 6) {
  return Object.entries(byExt)
    .slice()
    .sort((a, b) => b[1].lines - a[1].lines)
    .slice(0, limit);
}

export default function CodeSizePage() {
  return (
    <SigmarisLangProvider>
      <CodeSizeContent />
    </SigmarisLangProvider>
  );
}

function CodeSizeContent() {
  const [includeDocs, setIncludeDocs] = useState(false);
  const [includeEngine, setIncludeEngine] = useState(false);
  const [includeSql, setIncludeSql] = useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CodeStatsResponse | null>(null);

  const apiUrl = useMemo(() => {
    const u = new URL("/api/ops/code-stats", window.location.origin);
    u.searchParams.set("include_docs", includeDocs ? "1" : "0");
    u.searchParams.set("include_engine", includeEngine ? "1" : "0");
    u.searchParams.set("include_sql", includeSql ? "1" : "0");
    return u.toString();
  }, [includeDocs, includeEngine, includeSql]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(apiUrl, { credentials: "include" });
        const j = (await r.json().catch(() => null)) as CodeStatsResponse | null;
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setData(j);
      } catch (e: any) {
        setError(e?.message ?? "failed to load");
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [apiUrl]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="pt-28 px-6 pb-12 max-w-5xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold">Code Size (LOC)</h1>
        <p className="text-gray-400 mt-2">
          Repo内のソースコード行数を集計して、規模感を監査できます（Next.jsの生成物や
          node_modulesは除外）。
        </p>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={includeDocs}
              onChange={(e) => setIncludeDocs(e.target.checked)}
            />
            include docs (.md/.mdx)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={includeEngine}
              onChange={(e) => setIncludeEngine(e.target.checked)}
            />
            include `sigmaris-os/engine`
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={includeSql}
              onChange={(e) => setIncludeSql(e.target.checked)}
            />
            include `supabase/*.sql`
          </label>
        </div>

        {loading ? (
          <div className="mt-8 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="mt-8 bg-red-950/30 border border-red-700 rounded-xl p-4">
            <div className="font-semibold text-red-200">Error</div>
            <div className="text-red-200/80 text-sm mt-1">{error}</div>
            <div className="text-gray-400 text-xs mt-3">
              Productionで使う場合は `SIGMARIS_CODE_STATS_ENABLED=1` を設定してください。
            </div>
          </div>
        ) : data ? (
          <>
            <div className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-sm text-gray-300">
                generated_at:{" "}
                <span className="text-gray-100">{data.generated_at}</span>
              </div>
              <div className="text-sm text-gray-300 mt-1">
                repo_root: <span className="text-gray-100">{data.repo_root}</span>
              </div>
              <div className="text-sm text-gray-300 mt-3">
                excludes:{" "}
                <span className="text-gray-100">
                  {data.excludes.dirs.join(", ")}
                </span>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4">
              {data.projects.map((p) => (
                <div
                  key={p.name}
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-5"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="text-lg font-semibold">{p.name}</div>
                      <div className="text-xs text-gray-400 mt-1">{p.root}</div>
                      {p.note ? (
                        <div className="text-xs text-gray-400 mt-1">{p.note}</div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-300">total LOC</div>
                      <div className="text-2xl font-bold">{fmt(p.total.lines)}</div>
                      <div className="text-xs text-gray-400">
                        files: {fmt(p.total.files)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4">
                      <div className="text-xs text-gray-400">code</div>
                      <div className="text-lg font-semibold">{fmt(p.code.lines)}</div>
                      <div className="text-xs text-gray-500">
                        files: {fmt(p.code.files)}
                      </div>
                    </div>
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4">
                      <div className="text-xs text-gray-400">docs</div>
                      <div className="text-lg font-semibold">{fmt(p.docs.lines)}</div>
                      <div className="text-xs text-gray-500">
                        files: {fmt(p.docs.files)}
                      </div>
                    </div>
                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4">
                      <div className="text-xs text-gray-400">top extensions</div>
                      <div className="mt-2 space-y-1 text-xs text-gray-200">
                        {topExts(p.total.byExt, 6).map(([ext, v]) => (
                          <div key={ext} className="flex justify-between gap-3">
                            <span className="text-gray-300">{ext}</span>
                            <span className="text-gray-100">
                              {fmt(v.lines)} lines / {fmt(v.files)} files
                            </span>
                          </div>
                        ))}
                        {Object.keys(p.total.byExt).length === 0 ? (
                          <div className="text-gray-500">no files counted</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <section className="mt-10 bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-lg font-semibold">How it works</h2>
              <ul className="mt-3 text-sm text-gray-200 space-y-2 list-disc list-inside">
                <li>
                  `sigmaris-os` のAPI (`/api/ops/code-stats`) が、指定ディレクトリを再帰走査します。
                </li>
                <li>
                  `node_modules` / `.next` などの生成物・巨大フォルダはディレクトリ名で除外します。
                </li>
                <li>
                  対象拡張子（例: `.py`, `.ts(x)`, `.sql`）だけを読み込み、バイト列から改行数を数えて
                  LOCを算出します（末尾改行の扱いも安定）。
                </li>
                <li>
                  集計はプロジェクト別・拡張子別に合算し、UIで表示します。
                </li>
              </ul>

              <h3 className="text-sm font-semibold text-gray-100 mt-6">Diagram</h3>
              <pre className="mt-3 text-xs text-gray-200 bg-gray-950/70 border border-gray-800 rounded-xl p-4 overflow-auto">
{`Browser (Audit/Code Size page)
  |
  |  GET /api/ops/code-stats?include_docs=..&include_engine=..&include_sql=..
  v
sigmaris-os (Next.js Route Handler)
  |
  |-- Auth check (Supabase session cookie)
  |-- Resolve repo root (monorepo if siblings exist)
  |-- Walk directories (skip: node_modules/.next/dist/...)
  |-- Read allowed files (.py/.ts/.tsx/.sql/.md...)
  |-- Count LOC by newline bytes
  '-- Aggregate by project + extension
  |
  v
JSON response -> UI renders cards + breakdown`}
              </pre>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

