import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// === DB保存先を /data に設定 ===
const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "sigmaris.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
  console.log("📁 Created data directory:", dataDir);
}

const db = new Database(dbPath);

// === Personaテーブル（最新状態） ===
db.exec(`
  CREATE TABLE IF NOT EXISTS persona (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    calm REAL,
    empathy REAL,
    curiosity REAL,
    reflection TEXT,
    meta_summary TEXT,
    growth REAL
  )
`);

// === Personaログテーブル（履歴） ===
db.exec(`
  CREATE TABLE IF NOT EXISTS persona_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    calm REAL,
    empathy REAL,
    curiosity REAL,
    reflection TEXT,
    meta_summary TEXT,
    growth REAL
  )
`);

console.log("🧠 SQLite PersonaDB ready at", dbPath);

// === 最新のPersonaをロード ===
export function loadPersona() {
  const row = db
    .prepare(
      `SELECT calm, empathy, curiosity, reflection, meta_summary, growth, timestamp
       FROM persona ORDER BY id DESC LIMIT 1`
    )
    .get();

  if (!row) {
    return {
      calm: 0.5,
      empathy: 0.5,
      curiosity: 0.5,
      reflection: "",
      meta_summary: "",
      growth: 0,
      timestamp: new Date().toISOString(),
    };
  }
  return row;
}

// === Personaを保存（最新＋履歴） ===
export function savePersona(data: {
  calm: number;
  empathy: number;
  curiosity: number;
  reflectionText: string;
  metaSummary: string;
  growthWeight: number;
}) {
  const timestamp = new Date().toISOString();

  // persona（最新状態）に挿入
  db.prepare(
    `INSERT INTO persona
     (timestamp, calm, empathy, curiosity, reflection, meta_summary, growth)
     VALUES (@timestamp, @calm, @empathy, @curiosity, @reflectionText, @metaSummary, @growthWeight)`
  ).run({
    ...data,
    timestamp,
  });

  // persona_logs（履歴）にも複製
  db.prepare(
    `INSERT INTO persona_logs
     (timestamp, calm, empathy, curiosity, reflection, meta_summary, growth)
     VALUES (@timestamp, @calm, @empathy, @curiosity, @reflectionText, @metaSummary, @growthWeight)`
  ).run({
    ...data,
    timestamp,
  });

  return {
    calm: data.calm,
    empathy: data.empathy,
    curiosity: data.curiosity,
  };
}

// === 履歴を取得 ===
export function getPersonaLogs(limit = 20) {
  return db
    .prepare(
      `SELECT calm, empathy, curiosity, reflection, meta_summary, growth, timestamp
       FROM persona_logs ORDER BY id DESC LIMIT ?`
    )
    .all(limit);
}

// === 履歴を削除 ===
export function clearPersonaLogs() {
  db.exec("DELETE FROM persona_logs");
  console.log("🧹 Cleared persona_logs");
}

export default db;
