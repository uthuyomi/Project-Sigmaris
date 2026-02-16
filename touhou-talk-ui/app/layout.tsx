import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { TouhouThemeInit } from "@/components/TouhouThemeInit";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Touhou Talk",
    template: "%s | Touhou Talk",
  },
  description:
    "Touhou-inspired character chat UI built on Supabase Auth + Persona OS backend (sigmaris-core).",
  applicationName: "Touhou Talk",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Touhou Talk",
    description:
      "Touhou-inspired character chat UI built on Supabase Auth + Persona OS backend (sigmaris-core).",
    url: "/",
    siteName: "Touhou Talk",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "Touhou Talk",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Touhou Talk",
    description:
      "Touhou-inspired character chat UI built on Supabase Auth + Persona OS backend (sigmaris-core).",
    images: ["/og.svg"],
  },
  icons: {
    icon: [{ url: "/icons/icon.png", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Shippori+Mincho:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <TouhouThemeInit />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
