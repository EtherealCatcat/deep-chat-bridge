import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./api";

let granted = false;
let initialized = false;

export async function initNotifications(): Promise<void> {
  if (!isTauri() || initialized) return;
  initialized = true;
  try {
    const notification = await import("@tauri-apps/plugin-notification");
    granted = await notification.isPermissionGranted();
    if (!granted) {
      granted = (await notification.requestPermission()) === "granted";
    }
    if (!granted) return;
    await notification.onAction(() => {
      window.location.hash = "#chat";
      void invoke("focus_main").catch(() => undefined);
    });
  } catch (error) {
    console.warn("通知初始化失败。", error);
  }
}

export async function notifyMessage(text: string): Promise<void> {
  if (!granted) return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  const body = text.trim().slice(0, 160);
  if (!body) return;
  try {
    const notification = await import("@tauri-apps/plugin-notification");
    await notification.sendNotification({ title: "鲸鲸", body });
  } catch (error) {
    console.warn("发送通知失败。", error);
  }
}

export async function sendTestNotification(): Promise<void> {
  if (!isTauri()) throw new Error("系统通知只在桌面应用里可用。");
  const notification = await import("@tauri-apps/plugin-notification");
  const allowed = (await notification.isPermissionGranted()) || (await notification.requestPermission()) === "granted";
  if (!allowed) throw new Error("通知权限没有开；去系统设置里允许 DeepHome 通知。");
  granted = true;
  await notification.sendNotification({ title: "鲸鲸", body: "通知已接通。今晚也早点睡。" });
}
