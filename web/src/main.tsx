import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { isTauri, setApiBase } from "./api";
import "./index.css";

async function boot(): Promise<void> {
  if (isTauri()) {
    try {
      for (let i = 0; i < 40; i += 1) {
        const port = await invoke<number>("server_port").catch(() => 0);
        if (port) {
          setApiBase(`http://127.0.0.1:${port}`);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } catch (error) {
      console.warn("无法获取本地服务端口，继续用默认端口。", error);
    }
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
