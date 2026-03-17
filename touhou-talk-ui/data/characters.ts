import rawCharacters from "./characters.json";

export type CharacterDef = {
  id: string;
  name: string;
  title: string;
  promptVersion?: string;
  enabled?: boolean; // true(default) / false(UIで非表示・選択不可にする)
  world?: {
    map: string; // gensokyo / deep / higan など
    location: string; // scarlet_mansion / chireiden など
  };
  color: {
    accent: string;
  };
  ui: {
    avatar?: string;
    /** Backward-compatible fallback. Prefer chatBackgroundPC/SP in UI. */
    chatBackground?: string;
    chatBackgroundPC?: string;
    chatBackgroundSP?: string;
    placeholder: string;
  };
};

/**
 * Character master (id + world)
 * =============================
 * - `characters.json` を単一の真実（SSOT）として扱います。
 * - このファイルは型付けと、UI側の選択ロジック用ヘルパーを提供します。
 */
export const CHARACTERS = rawCharacters as Record<string, CharacterDef>;

export function isCharacterEnabled(ch: CharacterDef | null | undefined): boolean {
  if (!ch) return false;
  return ch.enabled !== false;
}

export function hasCharacterAvatar(ch: CharacterDef | null | undefined): boolean {
  const a = ch?.ui?.avatar;
  return typeof a === "string" && a.trim().length > 0;
}

export function isCharacterSelectable(ch: CharacterDef | null | undefined): boolean {
  return isCharacterEnabled(ch) && hasCharacterAvatar(ch);
}

/* =========================================================
 * 繧ｻ繝ｬ繧ｯ繧ｿ
 * ========================================================= */

export function getCharactersByLocation(map: string, locationId: string) {
  return Object.values(CHARACTERS).filter(
    (ch) =>
      isCharacterSelectable(ch) &&
      ch.world?.map === map &&
      ch.world?.location === locationId,
  );
}

export function canEnableGroupChat(map: string, locationId: string): boolean {
  return getCharactersByLocation(map, locationId).length >= 2;
}

export function getGroupChatCandidates(map: string, locationId: string) {
  return getCharactersByLocation(map, locationId);
}
