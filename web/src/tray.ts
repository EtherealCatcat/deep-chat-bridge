import { isTauri } from "./api";

/** Apply the temporary Menu Bar icon style to the native tray. */
export async function applyTrayStyle(style: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_tray_style", { style });
}
