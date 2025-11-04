// tools/buildMetaProject.ts
import fs from "fs";
import path from "path";

// === 設定 ===
const root = "./";
const outputFile = "sigmaris.mproj";

// 除外ディレクトリ・ファイルパターン
const excludeDirs = [
  "node_modules",
  ".next",
  "dist",
  "logs",
  "coverage",
  "public",
  ".git",
];

const excludeFiles = [
  // Next.js / config / env 系
  "next.config.js",
  "next-env.d.ts",
  "vercel.json",
  ".eslintrc",
  ".eslintrc.js",
  ".prettierrc",
  ".prettierrc.js",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  // テストや型検証系
  ".spec.",
  ".test.",
  "jest.config",
  "tsconfig.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
];

// === 再帰的にファイルを収集 ===
function collect(dir: string): string {
  let result = "";

  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);

    // 除外対象（ディレクトリ or ファイル）
    if (excludeDirs.some((e) => full.includes(e))) continue;
    if (excludeFiles.some((e) => full.includes(e))) continue;

    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      result += collect(full);
      continue;
    }

    // 対象拡張子：ソースコードとドキュメントのみ
    if (/\.(ts|tsx|js|jsx|json|md)$/i.test(file)) {
      const content = fs.readFileSync(full, "utf8");
      const lines = content.split("\n").length;

      // メタ情報付きで書き出し
      result += `\n\n#FILE: ${full}\n// Path: ${full}\n// Lines: ${lines}\n`;
      result += `${content}\n#END\n`;
    }
  }
  return result;
}

// === 出力 ===
fs.writeFileSync(outputFile, collect(root));
console.log(
  `✅ Meta project file generated (filtered for custom code only): ${outputFile}`
);
