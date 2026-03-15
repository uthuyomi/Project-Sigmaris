export type DesktopTtsMode = "none" | "browser" | "aquestalk";

export type DesktopAquesTalkSettings = {
  enabled: boolean;
  rootDir: string | null;
  speed: number;
  voice: string;
};

export type DesktopCharacterSettings = {
  schemaVersion: 1;
  characterId: string;
  vrm: {
    enabled: boolean;
    path: string | null;
  };
  tts: {
    mode: DesktopTtsMode;
    aquestalk: DesktopAquesTalkSettings;
  };
  motions: {
    enabled: boolean;
    indexPath: string | null;
  };
  updatedAt: string;
};

export function defaultCharacterSettings(characterId: string): DesktopCharacterSettings {
  return {
    schemaVersion: 1,
    characterId,
    vrm: { enabled: true, path: "avatar.vrm" },
    tts: {
      mode: "aquestalk",
      aquestalk: { enabled: true, rootDir: null, speed: 100, voice: "" },
    },
    motions: { enabled: true, indexPath: "motion-library/motions.json" },
    updatedAt: new Date().toISOString(),
  };
}
