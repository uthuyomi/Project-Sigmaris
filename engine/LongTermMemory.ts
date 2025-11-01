// engine/LongTermMemory.ts
export type Msg = { user: string; ai: string };
export type TraitLog = {
  calm: number;
  empathy: number;
  curiosity: number;
  timestamp: string;
};
export type Reflection = { text: string; timestamp: string };

type Snapshot = {
  version: 1;
  messages: Msg[];
  growthLog: TraitLog[];
  reflections: Reflection[];
  updatedAt: string;
};

const KEY = "sigmaris:memory:v1";

export class LongTermMemory {
  private safeWindow(): Window | null {
    if (typeof window === "undefined") return null;
    return window;
  }

  load(): Snapshot {
    const w = this.safeWindow();
    if (!w) {
      return {
        version: 1,
        messages: [],
        growthLog: [],
        reflections: [],
        updatedAt: new Date().toISOString(),
      };
    }
    const raw = w.localStorage.getItem(KEY);
    if (!raw) {
      return {
        version: 1,
        messages: [],
        growthLog: [],
        reflections: [],
        updatedAt: new Date().toISOString(),
      };
    }
    try {
      const parsed = JSON.parse(raw) as Snapshot;
      // 簡易バリデーション
      if (parsed?.version !== 1) throw new Error("version mismatch");
      return parsed;
    } catch {
      // 壊れてたら初期化
      return {
        version: 1,
        messages: [],
        growthLog: [],
        reflections: [],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  save(partial: Partial<Snapshot>) {
    const w = this.safeWindow();
    if (!w) return;
    const current = this.load();
    const next: Snapshot = {
      version: 1,
      messages: partial.messages ?? current.messages,
      growthLog: partial.growthLog ?? current.growthLog,
      reflections: partial.reflections ?? current.reflections,
      updatedAt: new Date().toISOString(),
    };
    // 上限（肥大化防止）
    next.messages = next.messages.slice(-300); // 直近300往復
    next.growthLog = next.growthLog.slice(-2000); // 直近2000点
    next.reflections = next.reflections.slice(-365); // 直近365日
    w.localStorage.setItem(KEY, JSON.stringify(next));
  }

  clear() {
    const w = this.safeWindow();
    if (!w) return;
    w.localStorage.removeItem(KEY);
  }

  exportJSONString(): string {
    const snap = this.load();
    return JSON.stringify(snap, null, 2);
  }

  importJSONString(json: string) {
    const w = this.safeWindow();
    if (!w) return;
    const parsed = JSON.parse(json) as Snapshot;
    if (parsed?.version !== 1) throw new Error("Invalid snapshot");
    w.localStorage.setItem(KEY, JSON.stringify(parsed));
  }
}
