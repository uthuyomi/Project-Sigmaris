import path from "node:path";

export function getDesktopUserDataDir(): string | null {
  const p = String(process.env.TOUHOU_DESKTOP_USERDATA_DIR ?? "").trim();
  return p ? p : null;
}

export function isDesktopRuntimeEnabled(): boolean {
  return !!getDesktopUserDataDir();
}

export function characterRootDir(userDataDir: string, characterId: string) {
  return path.join(userDataDir, "characters", characterId);
}

export function characterSettingsPath(userDataDir: string, characterId: string) {
  return path.join(characterRootDir(userDataDir, characterId), "settings.json");
}

export function characterVrmPath(userDataDir: string, characterId: string) {
  return path.join(characterRootDir(userDataDir, characterId), "avatar.vrm");
}

export function characterMotionLibraryDir(userDataDir: string, characterId: string) {
  return path.join(characterRootDir(userDataDir, characterId), "motion-library");
}

export function characterMotionIndexPath(userDataDir: string, characterId: string) {
  return path.join(characterMotionLibraryDir(userDataDir, characterId), "motions.json");
}

export function characterMotionGlbDir(userDataDir: string, characterId: string) {
  return path.join(characterMotionLibraryDir(userDataDir, characterId), "converted", "glb");
}

