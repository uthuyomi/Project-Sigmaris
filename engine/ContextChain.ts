// engine/ContextChain.ts
export interface ContextItem {
  user: string;
  ai: string;
}

export class ContextChain {
  private history: ContextItem[] = [];
  private limit = 3; // 直近3ターンまで保持

  add(user: string, ai: string) {
    this.history.push({ user, ai });
    if (this.history.length > this.limit) {
      this.history.shift();
    }
  }

  summarize(): string {
    if (this.history.length === 0) return "";
    const mapped = this.history
      .map((h, i) => `(${i + 1}) ユーザー: ${h.user}\nAI: ${h.ai}`)
      .join("\n");
    return `直近の会話履歴:\n${mapped}`;
  }

  clear() {
    this.history = [];
  }
}
