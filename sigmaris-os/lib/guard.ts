"use server";

/**
 * 課金/クレジットを廃止したため、フロント側の guard は「ログイン必須」だけを担う。
 * （利用回数・プラン・トライアル等の制限は行わない）
 */
export type GuardApiType =
  | "aei"
  | "reflect"
  | "identity"
  | "meta"
  | "value"
  | "introspect";

export async function guardUsageOrTrial(
  user: { id: string } | null,
  _type: GuardApiType
): Promise<void> {
  if (!user?.id) throw new Error("Unauthorized");
}

