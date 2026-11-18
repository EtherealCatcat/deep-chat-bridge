import { isTauri } from "./api";

export async function getAutostart(): Promise<boolean> {
  if (!isTauri()) return false;
  const autostart = await import("@tauri-apps/plugin-autostart");
  return autostart.isEnabled();
}

export async function setAutostart(active: boolean): Promise<void> {
  if (!isTauri()) throw new Error("开机自启只在桌面应用里可用。");
  const autostart = await import("@tauri-apps/plugin-autostart");
  if (active) await autostart.enable();
  else await autostart.disable();
}
