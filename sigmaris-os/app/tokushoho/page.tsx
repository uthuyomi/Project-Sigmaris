"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import { SigmarisLangProvider, useSigmarisLang } from "@/lib/sigmarisLangContext";

export default function TokushohoPage(): JSX.Element {
  return (
    <SigmarisLangProvider>
      <TokushohoContent />
    </SigmarisLangProvider>
  );
}

function TokushohoContent(): JSX.Element {
  const { lang } = useSigmarisLang();

  const t = {
    ja: {
      title: "特定商取引法に基づく表記（暫定）",
      subtitle:
        "現在の Sigmaris OS は、課金/クレジットによる有料提供を行っていません（開発・検証段階）。将来、有料提供を開始する場合は本ページを更新します。",
      items: [
        { label: "運営者", value: "（記載予定）" },
        { label: "連絡先", value: "sigumarisdev@gmail.com" },
        { label: "提供形態", value: "Webアプリ（ログイン機能あり）" },
        { label: "料金", value: "現在は無料（課金なし）" },
        { label: "支払い方法", value: "なし" },
      ],
      back: "ホームへ戻る",
    },
    en: {
      title: "Legal Notice (Temporary)",
      subtitle:
        "Sigmaris OS is currently not offered as a paid service (no billing/credits). This page will be updated if paid offerings are introduced in the future.",
      items: [
        { label: "Operator", value: "(TBD)" },
        { label: "Contact", value: "sigumarisdev@gmail.com" },
        { label: "Service", value: "Web app (login supported)" },
        { label: "Price", value: "Free for now (no billing)" },
        { label: "Payment", value: "N/A" },
      ],
      back: "Back to Home",
    },
  } as const;

  const text = t[lang];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24 relative overflow-hidden">
      <Header />

      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(68,116,255,0.1),transparent_70%)]"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <section className="relative z-10 max-w-4xl mx-auto mt-24">
        <motion.h1
          className="text-3xl md:text-5xl font-bold mb-6 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          {text.title}
        </motion.h1>

        <motion.p
          className="text-center text-[#b9c4d2] mb-10 max-w-3xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 1 }}
        >
          {text.subtitle}
        </motion.p>

        <motion.div
          className="border border-[#4c7cf7]/30 rounded-2xl p-8 backdrop-blur-md bg-[#141c26]/40 text-[#c4d0e2]"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 1 }}
        >
          <ul className="space-y-4">
            {text.items.map((item, i) => (
              <li key={i} className="flex flex-col md:flex-row md:gap-4">
                <span className="font-semibold text-[#4c7cf7] w-48 shrink-0">
                  {item.label}
                </span>
                <span>{item.value}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
        >
          <Link
            href="/home"
            className="px-8 py-3 border border-[#4c7cf7] rounded-full text-[#e6eef4] hover:bg-[#4c7cf7]/10 transition"
          >
            {text.back}
          </Link>
        </motion.div>
      </section>
    </main>
  );
}

