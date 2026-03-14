export const CHARACTER_CATALOG = [
  { id: "reimu", label: "霊夢" },
  { id: "marisa", label: "魔理沙" },
  { id: "alice", label: "アリス" },
  { id: "aya", label: "文" },
  { id: "meiling", label: "美鈴" },
  { id: "patchouli", label: "パチュリー" },
  { id: "reisen", label: "鈴仙" },
  { id: "momiji", label: "椛" },
  { id: "nitori", label: "にとり" },
  { id: "youmu", label: "妖夢" },
  { id: "remilia", label: "レミリア" },
  { id: "sakuya", label: "咲夜" },
  { id: "flandre", label: "フラン" },
  { id: "satori", label: "さとり" },
  { id: "rin", label: "燐" },
  { id: "okuu", label: "お空" },
  { id: "sanae", label: "早苗" },
  { id: "suwako", label: "諏訪子" },
  { id: "koishi", label: "こいし" },
  { id: "yuyuko", label: "幽々子" },
] as const;

export type CharacterCatalogEntry = (typeof CHARACTER_CATALOG)[number];
export type CharacterId = CharacterCatalogEntry["id"];

export function isKnownCharacterId(id: string): id is CharacterId {
  return CHARACTER_CATALOG.some((c) => c.id === id);
}

