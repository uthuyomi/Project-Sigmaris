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
    // Treat unconfigured assets as absent by default.
    // VRM/TTS/motions should not auto-enable unless explicitly set by the user.
    vrm: { enabled: false, path: null },
    tts: {
      mode: "none",
      aquestalk: { enabled: false, rootDir: null, speed: 100, voice: "" },
    },
    motions: { enabled: false, indexPath: null },
    updatedAt: new Date().toISOString(),
  };
}
