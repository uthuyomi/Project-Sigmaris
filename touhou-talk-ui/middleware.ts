import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function safeNextPath(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!s.startsWith("/")) return "";
  if (s.startsWith("//")) return "";
  if (s.includes("://")) return "";
  return s.length > 2048 ? s.slice(0, 2048) : s;
}

function copyCookies(from: NextResponse, to: NextResponse) {
  for (const c of from.cookies.getAll()) {
    to.cookies.set(c);
  }
}

export async function middleware(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
    auth: {
      // Keep sessions fresh (refresh tokens when needed) at the edge.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch {
    // Fail open: avoid 500s. Downstream pages/routes handle unauthorized states.
    return response;
  }

  if (!user) {
    const next = safeNextPath(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );

    const dest = request.nextUrl.clone();
    dest.pathname = "/auth/login";
    dest.search = next ? `?next=${encodeURIComponent(next)}` : "";

    const redirectRes = NextResponse.redirect(dest);
    copyCookies(response, redirectRes);
    return redirectRes;
  }

  return response;
}

export const config = {
  matcher: ["/chat/session/:path*", "/settings/:path*", "/map/session/:path*"],
};

