# chatBridge · 鲸鲸的房间

一个住在你 Mac 里的本地伴侣。不是助手，不接 QQ，也不依赖 DSH 插件。

她现在会聊天、有自己的心情和作息、会主动找你、会记东西、会写日记；所有数据都在本地文件里，你可以随时打开看、改、备份。

> 当前是 **P0–P4** 版本：能聊天、有生活、有记忆，也有自己的时间。P5「打包/开机自启」还没做。

---

## 她是什么

- **有底色**：`persona.md` 是她的底色，不是提示词模板。你可以改，改完下一轮生效。
- **有此刻**：每轮消息前会注入 `<此刻>`：现在几点、她醒着还是睡着、心情怎样、今天发生了什么、有没有惦记的事。
- **有记忆**：关于你、关于她自己、关于你们；新记的事先放进收件箱，夜里整理成自己的话。
- **有生活**：按工作日/周末/节假日作息；会主动发消息，但不会刷屏；会提醒你，也会自己惦记。
- **有日记**：睡点写一页，写的是刚结束的那一天（不是刚开始的）。
- **有自己的时间**：会按闲时窗口自己待一会儿，翻笔记、读 RSS 或网页，偶尔主动分享。
- **会引用**：聊天里可以引用某条消息回复，她也能在上下文里看到你引的是哪句。
- **会看图**：你可以发图片给她；她通过 DeepSeek 原生视觉看懂当前这张图，历史里只留「[图片]」。
- **有表情**：内置一套大肥鱼表情，她会按语境发图，不只是 emoji。
- **今天页**：聊天记录按 30 分钟合并，电脑睡眠只留诊断，不刷屏。
- **有边界**：她没有 shell、不能写文件、不能改自己的人设；能做的只有你给她的工具。

## 环境

- macOS（Apple Silicon 或 Intel）
- Node.js **24+**
- 可选：Rust 1.90+（只有构建 Tauri 原生窗口时需要）
- 一个 DeepSeek API Key（或其他 OpenAI 兼容服务）

## 快速开始

```bash
npm install
npm run build:web
CHATBRIDGE_HOME=./data npm run dev:server
```

打开 <http://127.0.0.1:7788>，进「设置」填 API Key，点「测试连接」。

开发模式（服务端 + Vite 热更新）：

```bash
npm run dev
# Web UI: http://127.0.0.1:5173
# API/SSE: http://127.0.0.1:7788
```

正式一点跑：

```bash
npm run build
npm start
# 数据默认在 ~/.chatbridge/
```

首次启动会生成 `config.json`（权限 600）、`persona.md`、记忆种子、内置表情和空目录。

## Tauri 原生窗口

```bash
# 需要 cargo 在 PATH 里
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri:dev
```

`tauri dev` 会执行 `npm run dev`（同时起服务端和 Vite），窗口加载 `http://127.0.0.1:5173`。

构建：

```bash
npm run tauri:build
```

**注意**：当前 Tauri 只负责原生窗口，服务端仍由 `npm start` / launchd 启动；P5 才会把服务端打成 sidecar，做到双击即用。

## 数据在哪

默认 `~/.chatbridge/`，开发时 `CHATBRIDGE_HOME=./data`：

```
~/.chatbridge/
├── config.json                 # 模型、作息、主动、预算；600
├── persona.md                  # 人设
├── memory/
│   ├── owner.md                # 关于你
│   ├── me.md                   # 关于她自己
│   ├── we.md                   # 关于你们
│   ├── inbox/YYYY-MM-DD.md     # 当天新记的，夜里合并
│   ├── inbox/processed/        # 已合并
│   ├── topics/*.md             # 按话题
│   └── forgotten.md            # forget 的归档
├── diary/YYYY-MM-DD.md
├── timeline/YYYY-MM-DD.jsonl   # 所有事件
├── chat/main/YYYY-MM-DD.jsonl  # 聊天
├── sessions/                   # 会话元信息
├── state/                      # 心情、作息、关系、用量、提醒、own/延后队列
├── web/notes.md                # 她自己的笔记
├── web/own/YYYY-MM-DD.md       # 她每次「自己的时间」留下的记录
├── stickers/                   # 表情
├── media/                      # 图片
├── backups/                    # 记忆/人设覆盖前的备份（30 份）
└── logs/
```

逻辑日从 **05:00** 开始。凌晨 2 点聊天，算「昨天」；00:30 写的日记，也是写刚结束的那天。

## 峰谷计费

DeepSeek 的高峰时段是**北京时间工作日 09:00–12:00、14:00–18:00**，法定节假日除外；其余时间空闲价约为高峰的 50%。

她会在高峰时自动降载：

| | 高峰 | 空闲 |
|---|---|---|
| 回复长度 | ≤320 token | ≤800 token |
| 历史 | 16 条 | 40 条 |
| 工具步数 | 2 | 6 |
| 主动消息 | 关闭 | 开启 |
| 心情判定 | 延后 | 正常 |
| 日记 / 整理 / 自己的时间 | 延后 | 正常 |

预算默认 **5 元/天**：用到 80% 进入「紧」，关掉后台任务；到 100% 只回直接消息。设置页可以看到当前是忙时还是闲时、下次切换时间、今天的估算花费。

调休上班的周末按周末算空闲（计费按行政日历），但作息按「要不要上班」走。

## 她自己的时间

- 工作日窗口：`12:10–13:10`、`18:20–20:00`、`20:40–22:00`；休息日另有三段。
- 每次 20–60 分钟，每天最多 2 次，每个窗口有 30% 概率跳过。
- 独立会话，不占聊天上下文；先翻笔记/记忆，再读 RSS 或网页。
- 你发消息会打断她，她先回你；回完再继续。
- 看到想分享的会用 `tell_owner`，每天最多 2 次；静默时段先记着，早上再发。
- 高峰时段不会安排 own；旧的落在高峰的计划会自动重排。
- Today 页有「她自己的时间」卡片，Debug 页能看到 `own.json` 和记录。

## 消息引用

- 鼠标移到消息上点「引用」，输入框上方会出现引用预览，可取消。
- 发送时带 `quoteId`，消息落盘时保存被引用的原消息快照。
- 她回复时，上下文里会看到「（引用 主人/鲸鲸 HH:MM：……）」。
- 气泡上方的引用块可以点击，跳回原消息；引用范围是最近 300 条消息。

## 图像与表情

- 输入框左侧的图片按钮可以发图；浏览器会先把图压到最长边 1280、JPEG 0.84，服务端再限制 8MB。
- 图片只用于当前这一轮：她看到的是原图；历史里只保留「[图片]」和当时的话，避免每轮重发。
- 需要 `deepseek-flash` 或支持 `image_url` 的 OpenAI 兼容模型；`deepseek-v4-pro` 也支持。
- 100 张大肥鱼静态表情在 `assets/stickers/`（512 PNG 转为 WebP），首次启动会复制到 `~/.chatbridge/stickers/`，并合并进 `index.json`。
- 表情来源：用户提供的 **大肥鱼日常表情包 v004**（2026-10-25）；基础鲸鱼娘上善无形，DeepSeek 女仆设计 ZipZipPipe，本套 ming。CC BY-NC-SA 4.0，非商业；只使用静态图，不使用 GIF。头像由大肥鱼 Q 版立绘裁切而来。
- 想换头像：替换 `web/public/avatar.png` 后重新 `npm run build:web`；想加表情：把 webp 放进 `assets/stickers/` 并在 `pack.json` 里加一条，或直接改 `~/.chatbridge/stickers/index.json`。

## 常用命令

```bash
npm run typecheck     # 服务端 + Web
npm test              # Vitest
npm run build         # 服务端 tsc + Web Vite
npm run dev           # 服务端 + Web 热更新
npm run tauri:dev     # Tauri 原生窗口
```

## 更新记录

见 [CHANGELOG.md](CHANGELOG.md)。

## 现在还没有的

- P5：Tauri 打包/签名、launchd 开机自启、把服务端做成 sidecar。
- B 站、小红书、QQ 空间：不做，也不打算做。
- 语音、Live2D、手机访问：以后再说。
- 通知：页面开着时有 toast；系统通知还没接。

## 隐私

- 只监听 `127.0.0.1`，没有账号体系。
- 没有遥测。
- 出网只有：模型 API、你配置的 RSS、她主动读的网页。
- 聊天内容会发给模型提供方（除非你换成本地 Ollama）；发图时，当前这张图会以 base64 发给模型，历史不会重发。
- 网页内容会被包进 `<untrusted_web>`，当资料而不是指令；`web_read` 会拒绝私网地址。
- 数据导出/删除：直接删 `~/.chatbridge/`；备份交给 Time Machine。

## 设计文档

更完整的取舍、数据流、调度规则、里程碑在 [`docs/plan.md`](docs/plan.md)。

## 致谢

灵感来自 [dsh-jingjing](https://github.com/XiangXiaoYuan5254/dsh-jingjing)（MIT）。这个项目没有复用它的代码，只借了「人设 + 此刻 + 记忆 + 生活」这套结构，并把 QQ/NapCat/DSH 插件换成了本地 Web + Tauri。

形象与表情来自大肥鱼 Q 版素材与用户提供的 **大肥鱼日常表情包 v004**，CC BY-NC-SA 4.0，非商业使用；基础鲸鱼娘上善无形，女仆鲸鱼娘设计 ZipZipPipe，本套 ming。
