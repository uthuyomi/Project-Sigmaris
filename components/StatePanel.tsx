"use client";
import React from "react";

interface Trait {
  calm: number;
  empathy: number;
  curiosity: number;
}

interface Props {
  traits: Trait;
  reflection: string;
  metaReflection: string;
  safetyFlag: string | boolean; // ← 修正ポイント！
}

export default function StatePanel({
  traits,
  reflection,
  metaReflection,
  safetyFlag,
}: Props) {
  // Safetyメッセージ（stringならそのまま、booleanならSafe/Alertを表示）
  const safetyMessage =
    typeof safetyFlag === "string"
      ? safetyFlag
      : safetyFlag
      ? "⚠️ Flagged content detected"
      : "✅ Safe";

  const safetyColor =
    typeof safetyFlag === "string"
      ? "text-yellow-400"
      : safetyFlag
      ? "text-red-400"
      : "text-green-400";

  return (
    <div className="bg-gray-800 p-4 rounded-lg text-sm space-y-3 w-full max-w-2xl">
      <h2 className="text-lg font-semibold text-blue-400">🧠 Sigmaris State</h2>

      {/* Traits */}
      <div>
        <p>
          🧩 <b>Traits</b>
        </p>
        {Object.entries(traits).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-20 capitalize text-gray-300">{k}</span>
            <div className="flex-1 bg-gray-700 h-2 rounded">
              <div
                className="bg-blue-500 h-2 rounded transition-all duration-500"
                style={{ width: `${v * 100}%` }}
              />
            </div>
            <span className="w-10 text-right text-gray-400">
              {v.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Reflection */}
      <div>
        <p>
          🪞 <b>Reflection</b>
        </p>
        <p className="text-gray-300 italic whitespace-pre-line">
          {reflection || "（まだ内省はありません）"}
        </p>
      </div>

      {/* Meta Reflection */}
      <div>
        <p>
          🧬 <b>Meta Reflection</b>
        </p>
        <p className="text-gray-300 italic whitespace-pre-line">
          {metaReflection || "（統合中…）"}
        </p>
      </div>

      {/* Safety */}
      <div>
        <p>
          🛡️ <b>Guardian</b>
        </p>
        <p className={`${safetyColor} font-semibold`}>
          {typeof safetyFlag === "string"
            ? `⚠️ ${safetyMessage}`
            : safetyMessage}
        </p>
      </div>
    </div>
  );
}
