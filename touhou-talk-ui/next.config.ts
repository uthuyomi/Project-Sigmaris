import type { NextConfig } from "next";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";

// Monorepo: load env from repo root (`../.env`) so all apps can share one config.
// Next.js will still load `touhou-talk-ui/.env*` afterwards (which can override).
const configDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(configDir, "..");
const isDev = process.env.NODE_ENV !== "production";
loadEnvConfig(rootDir, isDev);

const nextConfig: NextConfig = {
  output: "standalone",
  // Limit output file tracing to this app directory.
  // In a monorepo build environment (e.g. Vercel), a broader tracing root can accidentally pull
  // large `public/` assets into serverless function bundles and exceed size limits.
  outputFileTracingRoot: configDir,
  // Ensure public runtime config is always inlined for client components.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SIGMARIS_CORE: process.env.NEXT_PUBLIC_SIGMARIS_CORE,
  },
  // Vercel: avoid bundling large static assets into serverless functions via output file tracing.
  // Static assets in `public/` are deployed separately and do not need to be part of function bundles.
  outputFileTracingExcludes: {
    "*": [
      "public/background/**",
      "public/avatar/**",
      "public/maps/**",
      "public/top/**",
      "public/entry/**",
      // Some build environments report paths relative to the monorepo root.
      "touhou-talk-ui/public/background/**",
      "touhou-talk-ui/public/avatar/**",
      "touhou-talk-ui/public/maps/**",
      "touhou-talk-ui/public/top/**",
      "touhou-talk-ui/public/entry/**",
    ],
  },
};

export default nextConfig;
