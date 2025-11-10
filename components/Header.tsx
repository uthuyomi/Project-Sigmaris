"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useSigmarisLang } from "@/lib/sigmarisLangContext";

export default function Header() {
  const { lang, setLang } = useSigmarisLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const supabase = createClientComponentClient();

  // ✅ ログイン状態・残高を取得
  useEffect(() => {
    const loadUser = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("credit_balance")
          .eq("id", currentUser.id)
          .single();

        if (profile) setCredits(profile.credit_balance);
      }
    };
    loadUser();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  const text = {
    home: lang === "ja" ? "ホーム" : "Home",
    about: lang === "ja" ? "概要" : "About",
    sigmaris: "Sigmaris",
    vision: lang === "ja" ? "理念" : "Vision",
    docs: lang === "ja" ? "ドキュメント" : "Docs",
    plans: lang === "ja" ? "プラン" : "Plans",
    funding: lang === "ja" ? "支援" : "Funding",
    tokushoho: lang === "ja" ? "特定商取引法" : "Legal",
    switch: lang === "ja" ? "EN" : "JP",
    login: lang === "ja" ? "ログイン" : "Login",
    signup: lang === "ja" ? "新規登録" : "Sign Up",
    logout: lang === "ja" ? "ログアウト" : "Logout",
    balance: lang === "ja" ? "残高" : "Balance",
  };

  return (
    <motion.header
      className="fixed top-0 left-0 w-full z-50 bg-[#0e141b]/70 backdrop-blur-lg border-b border-[#1f2835] px-6 py-3 flex items-center justify-between"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* === ロゴ === */}
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

      {/* === PC用ナビ === */}
      <nav className="hidden md:flex items-center gap-6 text-sm">
        <Link href="/about" className="text-[#c9d2df] hover:text-[#4c7cf7]">
          {text.about}
        </Link>
        <Link
          href="/about/sigmaris"
          className="text-[#c9d2df] hover:text-[#4c7cf7]"
        >
          {text.sigmaris}
        </Link>
        <Link href="/vision" className="text-[#c9d2df] hover:text-[#4c7cf7]">
          {text.vision}
        </Link>
        <Link href="/docs" className="text-[#c9d2df] hover:text-[#4c7cf7]">
          {text.docs}
        </Link>
        <Link href="/plans" className="text-[#c9d2df] hover:text-[#4c7cf7]">
          {text.plans}
        </Link>
        <Link href="/funding" className="text-[#c9d2df] hover:text-[#4c7cf7]">
          {text.funding}
        </Link>
        <Link href="/tokushoho" className="text-[#c9d2df] hover:text-[#4c7cf7]">
          {text.tokushoho}
        </Link>

        {/* === 言語切替 === */}
        <button
          onClick={() => setLang(lang === "ja" ? "en" : "ja")}
          className="ml-2 px-3 py-1 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/20 transition"
        >
          {text.switch}
        </button>

        {/* === ログイン状態 === */}
        {user ? (
          <div className="flex items-center gap-3 ml-4 text-[#c4d0e2]">
            <span className="text-xs">👤 {user.email?.split("@")[0]}</span>
            <span className="text-xs">
              💳 {text.balance}：
              {credits !== null ? `${credits} credits` : "読込中…"}
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-1 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/20 transition"
            >
              {text.logout}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 ml-4">
            <Link
              href="/auth/login"
              className="px-3 py-1 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/20 transition"
            >
              {text.login}
            </Link>
            <Link
              href="/auth/signup"
              className="px-3 py-1 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/20 transition"
            >
              {text.signup}
            </Link>
          </div>
        )}
      </nav>

      {/* === モバイル用メニューアイコン === */}
      <button
        className="md:hidden flex flex-col justify-center items-center w-8 h-8 focus:outline-none"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <span
          className={`block w-6 h-0.5 bg-[#e6eef4] transition-all duration-300 ${
            menuOpen ? "rotate-45 translate-y-1.5" : ""
          }`}
        />
        <span
          className={`block w-6 h-0.5 bg-[#e6eef4] my-1 transition-all duration-300 ${
            menuOpen ? "opacity-0" : ""
          }`}
        />
        <span
          className={`block w-6 h-0.5 bg-[#e6eef4] transition-all duration-300 ${
            menuOpen ? "-rotate-45 -translate-y-1.5" : ""
          }`}
        />
      </button>

      {/* === モバイル用ナビ展開 === */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            key="mobile-nav"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="absolute top-16 left-0 w-full bg-[#0e141b]/95 backdrop-blur-xl border-t border-[#1f2835] flex flex-col items-center gap-5 py-6 text-sm md:hidden"
          >
            {[
              { href: "/about", label: text.about },
              { href: "/about/sigmaris", label: text.sigmaris },
              { href: "/vision", label: text.vision },
              { href: "/docs", label: text.docs },
              { href: "/plans", label: text.plans },
              { href: "/funding", label: text.funding },
              { href: "/tokushoho", label: text.tokushoho },
            ].map((link, i) => (
              <Link
                key={i}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="hover:text-[#4c7cf7] transition"
              >
                {link.label}
              </Link>
            ))}

            {/* 言語切替 */}
            <button
              onClick={() => {
                setLang(lang === "ja" ? "en" : "ja");
                setMenuOpen(false);
              }}
              className="mt-2 px-4 py-1 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/20 transition"
            >
              {text.switch}
            </button>

            {/* ログイン状態 */}
            {user ? (
              <div className="mt-3 flex flex-col items-center gap-2 text-[#c4d0e2]">
                <span className="text-xs">👤 {user.email?.split("@")[0]}</span>
                <span className="text-xs">
                  💳 {text.balance}：
                  {credits !== null ? `${credits} credits` : "読込中…"}
                </span>
                <button
                  onClick={handleLogout}
                  className="mt-1 px-4 py-1 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/20 transition"
                >
                  {text.logout}
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col items-center gap-2">
                <Link
                  href="/auth/login"
                  onClick={() => setMenuOpen(false)}
                  className="px-4 py-1 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/20 transition"
                >
                  {text.login}
                </Link>
                <Link
                  href="/auth/signup"
                  onClick={() => setMenuOpen(false)}
                  className="px-4 py-1 border border-[#4c7cf7] rounded-full hover:bg-[#4c7cf7]/20 transition"
                >
                  {text.signup}
                </Link>
              </div>
            )}
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
