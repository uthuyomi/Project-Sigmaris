import {
  Phase04Attachment,
  Phase04LinkAnalysis,
} from "@/lib/server/session-message-v2/types";

/* =========================================================
 * Contextual phrase guards
 * - Prevent “決め台詞の脈絡なし注入” across characters
 * - Apply minimal, conservative replacements to avoid breaking meaning
 * ========================================================= */

export function clampText(s: string, n: number) {
  const t = String(s ?? "");
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + "…";
}

export function extractUrls(text: string): string[] {
  const t = String(text ?? "");
  const re = /https?:\/\/[^\s<>"')\]]+/g;
  const matches = t.match(re) ?? [];
  const uniq: string[] = [];
  for (const m of matches) {
    const u = String(m ?? "").trim();
    if (!u) continue;
    if (!uniq.includes(u)) uniq.push(u);
    if (uniq.length >= 3) break;
  }
  return uniq;
}

export function containsAny(text: string, needles: string[]) {
  const t = String(text ?? "");
  return needles.some((n) => n && t.includes(n));
}

export function extractTheme(text: string): string | null {
  const t = String(text ?? "");
  const m =
    t.match(/(?:テーマは|テーマ[:：]|topic[:：]?)\s*([^\n。]+)\s*/i) ??
    t.match(/(?:テーマ|topic)\s*=\s*([^\n。]+)\s*/i);
  const v = m && typeof m[1] === "string" ? m[1].trim() : "";
  return v ? v.slice(0, 120) : null;
}

export function defaultNewsDomains(): string[] {
  const env = String(process.env.SIGMARIS_AUTO_BROWSE_NEWS_DOMAINS ?? "").trim();
  if (env) return env.split(",").map((x) => x.trim()).filter(Boolean);
  // conservative defaults (can be overridden by env)
  return [
    "nhk.or.jp",
    "nikkei.com",
    "asahi.com",
    "yomiuri.co.jp",
    "mainichi.jp",
    "jiji.com",
    "kyodonews.jp",
    "itmedia.co.jp",
    "impress.co.jp",
    "reuters.com",
  ];
}

export function detectAutoBrowse(text: string): {
  enabled: boolean;
  query: string;
  recency_days: number;
  domains: string[] | null;
} {
  const t = String(text ?? "").trim();
  if (!t) return { enabled: false, query: "", recency_days: 7, domains: null };

  if ((process.env.SIGMARIS_AUTO_BROWSE_ENABLED ?? "").toLowerCase() === "0") {
    return { enabled: false, query: "", recency_days: 7, domains: null };
  }

  const optOut = [
    "検索しないで",
    "ネット見ないで",
    "ブラウズしないで",
    "推測でいい",
    "勘でいい",
    "オフラインで",
    "参照不要",
    "ソース不要",
  ];
  if (containsAny(t, optOut)) return { enabled: false, query: "", recency_days: 7, domains: null };

  const triggers = ["調べて", "検索", "探して", "ニュース", "速報", "ヘッドライン", "最新", "ソース", "出典", "根拠", "参照", "リンク"];
  if (!containsAny(t, triggers)) return { enabled: false, query: "", recency_days: 7, domains: null };

  const isNews = containsAny(t, ["ニュース", "速報", "ヘッドライン", "記事"]);
  const isRecent = containsAny(t, ["今日", "本日", "最新", "いま", "今"]);
  const recency_days = isNews || isRecent ? 1 : 30;

  const theme = extractTheme(t);
  const wantsAI = containsAny(t, ["AI", "生成AI", "LLM", "ChatGPT", "エージェント"]) || (theme ? containsAny(theme, ["AI", "生成AI", "LLM", "ChatGPT"]) : false);
  const wantsJapan = containsAny(t, ["日本", "国内", "jp", "JAPAN"]) || (theme ? containsAny(theme, ["日本", "国内"]) : false);

  const tokens: string[] = [];
  if (isRecent) tokens.push("今日");
  if (wantsJapan) tokens.push("日本");
  if (wantsAI) tokens.push("AI");
  if (theme && theme.length > 0) tokens.push(theme);
  if (isNews) tokens.push("ニュース");

  // Use the user text as query; Serper supports natural queries.
  const baseQ = tokens.length > 0 ? tokens.join(" ") : t;
  const q = clampText(baseQ.replace(/\s+/g, " ").trim(), 240);
  const domains = isNews ? defaultNewsDomains() : null;
  return { enabled: true, query: q, recency_days, domains };
}

export function githubRepoQueryFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const owner = parts[0] ?? "";
    const repo = parts[1] ?? "";
    if (owner && repo) return `${repo} user:${owner}`;
    if (owner) return `user:${owner}`;
    return null;
  } catch {
    return null;
  }
}

export async function coreJson<T>(params: {
  url: string;
  accessToken: string | null;
  body: unknown;
}): Promise<{ ok: boolean; status: number; json: T | null; text: string }> {
  const r = await fetch(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {}),
    },
    body: JSON.stringify(params.body),
  });
  const text = await r.text().catch(() => "");
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    json = null;
  }
  return { ok: r.ok, status: r.status, json, text };
}

export async function uploadAndParseFiles(params: {
  base: string;
  accessToken: string | null;
  files: File[];
}): Promise<Phase04Attachment[]> {
  const out: Phase04Attachment[] = [];

  for (const file of params.files.slice(0, 3)) {
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const up = await fetch(`${params.base}/io/upload`, {
        method: "POST",
        headers: {
          ...(params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {}),
        },
        body: form,
      });
      if (!up.ok) continue;

      const upJson = (await up.json().catch(() => null)) as
        | { attachment_id?: unknown; file_name?: unknown; mime_type?: unknown }
        | null;
      const attachmentId = typeof upJson?.attachment_id === "string" ? upJson.attachment_id : null;
      if (!attachmentId) continue;

      const parsed = await coreJson<{ ok?: boolean; kind?: unknown; parsed?: unknown }>({
        url: `${params.base}/io/parse`,
        accessToken: params.accessToken,
        body: { attachment_id: attachmentId, kind: null },
      });
      const kind = typeof parsed.json?.kind === "string" ? parsed.json.kind : "unknown";

      const parsedAny = (parsed.json as any)?.parsed;
      const excerptCandidate =
        typeof parsedAny?.raw_excerpt === "string"
          ? parsedAny.raw_excerpt
          : typeof parsedAny?.text_excerpt === "string"
            ? parsedAny.text_excerpt
            : typeof parsedAny?.content_summary === "string"
              ? parsedAny.content_summary
              : typeof parsedAny?.excerpt_summary === "string"
                ? parsedAny.excerpt_summary
                : typeof parsedAny?.ocr?.detected_text === "string"
                  ? parsedAny.ocr.detected_text
              : "";

      out.push({
        type: "upload",
        attachment_id: attachmentId,
        file_name: typeof upJson?.file_name === "string" ? upJson.file_name : file.name,
        mime_type:
          typeof upJson?.mime_type === "string"
            ? upJson.mime_type
            : (file.type || "application/octet-stream"),
        kind,
        parsed_excerpt: excerptCandidate ? clampText(String(excerptCandidate), 1200) : undefined,
      });
    } catch {
      // ignore single-file failure
    }
  }

  return out;
}

export async function analyzeLinks(params: {
  base: string;
  accessToken: string | null;
  urls: string[];
}): Promise<Phase04LinkAnalysis[]> {
  const out: Phase04LinkAnalysis[] = [];

  for (const url of params.urls.slice(0, 3)) {
    const ghQ = githubRepoQueryFromUrl(url);
    if (ghQ) {
      const r = await coreJson<{ ok?: boolean; results?: unknown[] }>({
        url: `${params.base}/io/github/repos`,
        accessToken: params.accessToken,
        body: { query: ghQ, max_results: 5 },
      });
      const results = Array.isArray(r.json?.results) ? (r.json?.results as any[]) : [];
      out.push({
        type: "link_analysis",
        url,
        provider: "github_repo_search",
        results: results.slice(0, 5).map((x) => ({
          name: typeof x?.name === "string" ? x.name : undefined,
          owner: typeof x?.owner === "string" ? x.owner : undefined,
          snippet: typeof x?.description === "string" ? x.description : undefined,
          repository_url: typeof x?.repository_url === "string" ? x.repository_url : undefined,
        })),
      });
      continue;
    }

    // Prefer /io/web/fetch for deeper content (allowlist + summarization). Fallback to web_search.
    const f = await coreJson<{
      ok?: boolean;
      title?: unknown;
      final_url?: unknown;
      summary?: unknown;
      text_excerpt?: unknown;
      key_points?: unknown;
      sources?: unknown[];
    }>({
      url: `${params.base}/io/web/fetch`,
      accessToken: params.accessToken,
      body: { url, summarize: true, max_chars: 12000 },
    });

    const fj = f.json;
    const fetchedSnippet =
      f.ok && fj
        ? typeof fj.summary === "string"
          ? String(fj.summary)
          : typeof fj.text_excerpt === "string"
            ? String(fj.text_excerpt)
            : ""
        : "";

    if (fetchedSnippet && fj) {
      const kp = Array.isArray(fj.key_points) ? (fj.key_points as any[]) : [];
      const title = typeof fj.title === "string" ? fj.title : "";
      const finalUrl = typeof fj.final_url === "string" ? fj.final_url : url;
      out.push({
        type: "link_analysis",
        url,
        provider: "web_fetch",
        results: [
          {
            title: title || undefined,
            snippet: clampText(fetchedSnippet, 600),
            url: finalUrl || url,
          },
          ...kp.slice(0, 3).map((x) => ({ snippet: clampText(String(x ?? ""), 160) })),
        ],
      });
      continue;
    }

    const r = await coreJson<{ ok?: boolean; results?: unknown[] }>({
      url: `${params.base}/io/web/search`,
      accessToken: params.accessToken,
      body: { query: url, max_results: 5 },
    });
    const results = Array.isArray(r.json?.results) ? (r.json?.results as any[]) : [];
    out.push({
      type: "link_analysis",
      url,
      provider: "web_search",
      results: results.slice(0, 5).map((x) => ({
        title: typeof x?.title === "string" ? x.title : undefined,
        snippet: typeof x?.snippet === "string" ? x.snippet : undefined,
        url: typeof x?.url === "string" ? x.url : undefined,
      })),
    });
  }

  return out;
}

export async function autoBrowseFromText(params: {
  base: string;
  accessToken: string | null;
  userText: string;
}): Promise<Phase04LinkAnalysis[]> {
  const intent = detectAutoBrowse(params.userText);
  if (!intent.enabled) return [];

  const maxResultsRaw = Number(process.env.SIGMARIS_AUTO_BROWSE_MAX_RESULTS ?? "5");
  const maxResults = Number.isFinite(maxResultsRaw) ? Math.min(8, Math.max(1, maxResultsRaw)) : 5;

  const sr = await coreJson<{ ok?: boolean; results?: unknown[] }>({
    url: `${params.base}/io/web/search`,
    accessToken: params.accessToken,
    body: {
      query: intent.query,
      max_results: maxResults,
      recency_days: intent.recency_days,
      safe_search: "active",
      domains: intent.domains,
    },
  });

  const results = Array.isArray(sr.json?.results) ? (sr.json?.results as any[]) : [];
  const top = results.slice(0, maxResults);

  const analyses: Phase04LinkAnalysis[] = [];
  analyses.push({
    type: "link_analysis",
    url: `query:${intent.query}`,
    provider: "web_search",
    results: top.map((x) => ({
      title: typeof x?.title === "string" ? x.title : undefined,
      snippet: typeof x?.snippet === "string" ? x.snippet : undefined,
      url: typeof x?.url === "string" ? x.url : undefined,
    })),
  });

  // Deep fetch a couple of URLs (allowlist enforced by core)
  const fetchTopRaw = Number(process.env.SIGMARIS_AUTO_BROWSE_FETCH_TOP ?? "2");
  const fetchTop = Number.isFinite(fetchTopRaw) ? Math.min(3, Math.max(0, fetchTopRaw)) : 2;

  const urls = top
    .map((x) => (typeof x?.url === "string" ? String(x.url) : ""))
    .filter(Boolean)
    .slice(0, fetchTop);

  const fetched = await analyzeLinks({ base: params.base, accessToken: params.accessToken, urls });
  return [...analyses, ...fetched];
}

export function buildAugmentedMessage(params: {
  userText: string;
  uploads: Phase04Attachment[];
  linkAnalyses: Phase04LinkAnalysis[];
}) {
  let msg = String(params.userText ?? "").trim();

  if (params.uploads.length > 0) {
    const lines: string[] = [];
    lines.push("[添付ファイルの解析結果（自動）]");
    for (const a of params.uploads.slice(0, 3)) {
      const head = `- ${a.file_name} (${a.kind}, ${a.mime_type})`;
      const body = a.parsed_excerpt
        ? `  ${clampText(a.parsed_excerpt.replace(/\s+/g, " ").trim(), 900)}`
        : "";
      lines.push(body ? `${head}\n${body}` : head);
    }
    msg += "\n\n" + lines.join("\n");
  }

  return clampText(msg, 12000);
}