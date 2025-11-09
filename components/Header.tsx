"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useSigmarisLang } from "@/lib/sigmarisLangContext"; // ✅ ←ここが重要（useLangではなくuseSigmarisLang）

export default function Header() {
  // ✅ useLang → useSigmarisLang に修正
  const { lang, setLang } = useSigmarisLang();

  const text = {
    home: lang === "ja" ? "ホーム" : "Home",
    about: lang === "ja" ? "概要" : "About",
    sigmaris: "Sigmaris",
    docs: lang === "ja" ? "ドキュメント" : "Docs",
    plans: lang === "ja" ? "プラン" : "Plans",
    funding: lang === "ja" ? "支援" : "Funding",
    tokushoho: lang === "ja" ? "特定商取引法" : "Legal Disclosure",
    switch: lang === "ja" ? "EN" : "JP",
  };

  return (
    <motion.header
      className="fixed top-0 left-0 w-full z-50 bg-[#0e141b]/70 backdrop-blur-lg border-b border-[#1f2835] flex items-center justify-between px-6 py-3"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* 左ロゴ */}
      <Link
        href="/"
        className="flex items-center gap-2 hover:opacity-90 transition"
      >
        <Image
          src="/logo.png"
          alt="Sigmaris Logo"
          width={36}
          height={36}
          priority
          className="w-9 h-9 object-contain"
        />
        <span className="text-[#e6eef4] font-semibold text-sm tracking-wide select-none">
          Sigmaris OS
        </span>
      </Link>

      {/* 右ナビ */}
      <nav className="flex items-center gap-6 text-sm">
        <Link
          href="/about"
          className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
        >
          {text.about}
        </Link>
        <Link
          href="/about/sigmaris"
          className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
        >
          {text.sigmaris}
        </Link>
        <Link
          href="/docs"
          className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
        >
          {text.docs}
        </Link>
        <Link
          href="/plans"
          className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
        >
          {text.plans}
        </Link>
        <Link
          href="/funding"
          className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
        >
          {text.funding}
        </Link>
        <Link
          href="/tokushoho"
          className="text-[#c9d2df] hover:text-[#4c7cf7] transition"
        >
          {text.tokushoho}
        </Link>

        <button
          onClick={() => setLang(lang === "ja" ? "en" : "ja")}
          className="ml-2 px-3 py-1 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/20 transition"
        >
          {text.switch}
        </button>
      </nav>
    </motion.header>
  );
}
