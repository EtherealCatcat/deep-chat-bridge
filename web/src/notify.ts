import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./api";

let granted = false;
let initialized = false;
let native = false;

function openChat(): void {
  window.location.hash = "#chat";
  void invoke("focus_main").catch(() => undefined);
}

function listenForClicks(): void {
  void import("@tauri-apps/api/event")
    .then(({ listen }) => listen("notification-clicked", () => openChat()))
    .catch(() => undefined);
}

export async function initNotifications(): Promise<void> {
  if (!isTauri() || initialized) return;
  initialized = true;
  try {
    // macOS 上走 Rust 侧的原生通道（UNUserNotificationCenter + willPresent），
    // 这样 App 在前台也能弹横幅；插件通道在 macOS 上用的是已废弃的
    // NSUserNotificationCenter，前台时系统会把横幅吞掉。
    native = await invoke<boolean>("notify_supported").catch(() => false);
    listenForClicks();
    const notification = await import("@tauri-apps/plugin-notification");
    granted = await notification.isPermissionGranted();
    if (!granted) {
      granted = (await notification.requestPermission()) === "granted";
    }
    if (!granted && !native) return;
    await notification.onAction(() => openChat());
  } catch (error) {
    console.warn("通知初始化失败。", error);
  }
}

async function deliver(title: string, body: string): Promise<void> {
  if (native) {
    try {
      await invoke("notify_native", { title, body, sound: true });
      return;
    } catch (error) {
      console.warn("原生通知失败，退回插件通道。", error);
      native = false;
    }
  }
  const notification = await import("@tauri-apps/plugin-notification");
  await notification.sendNotification({ title, body });
}

export async function notifyMessage(text: string): Promise<void> {
  if (!granted && !native) return;
  const body = text.trim().slice(0, 160);
  if (!body) return;
  try {
    await deliver("鲸鲸", body);
  } catch (error) {
    console.warn("发送通知失败。", error);
  }
}

export async function sendTestNotification(): Promise<void> {
  if (!isTauri()) throw new Error("系统通知只在桌面应用里可用。");
  const notification = await import("@tauri-apps/plugin-notification");
  const allowed = (await notification.isPermissionGranted()) || (await notification.requestPermission()) === "granted";
  if (!allowed && !native) throw new Error("通知权限没有开；去系统设置里允许 DeepHome 通知。");
  granted = true;
  await deliver("鲸鲸", "通知已接通。今晚也早点睡。");
}
