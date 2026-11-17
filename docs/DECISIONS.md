# DECISIONS.md — 1g1g Revival 技术决策记录

## D1 (2026-11-17) 技术栈
- **前端**：Vite + React 18 + TypeScript + Zustand。理由：任务书允许自选；mygo 的 Solid+SSR 前端为网易云风格，无复用价值；亦歌是单页应用，SSR 无益。
- **服务端**：零依赖 Node http（移植 mygo server.mjs 模式）。理由：该模式已在 mygo 中验证可 Docker 一键部署；不引入 Express 等框架减少依赖面。
- **数据库**：`node:sqlite`（Node 22.5+ 内置，本机 Node 24.2）。理由：零原生依赖（better-sqlite3 在 Docker/ARM 上有构建风险）；数据量为单用户级，SQLite 足够。
- **音频**：HTML5 Audio + 同源 `/api/stream` 代理。网易云 URL 带防盗链时效，前端不直接持有 URL，播放时按需取流。

## D2 (2026-11-17) 音乐来源
- 仅复用 mygo-web-cloudmusic **已验证**的取流链路（EAPI `/api/song/enhance/player/url/v1` + 三条件可播放判定），原样移植 netease.mjs。
- 不实现会员破解、不伪造身份；匿名可播即免费，不可播即过滤。
- Provider 适配层隔离：前端只依赖 /api/* 自有接口，不出现网易云域名。

## D3 (2026-11-17) 用户体系
- 自建邮箱+密码（scrypt 哈希，node:crypto），HttpOnly Cookie 会话。原版亦歌即邮箱注册（Android 截图：用户名/邮箱 + 密码）。
- 网易云扫码登录不进入一期范围（原版亦歌也没有）。

## D4 (2026-11-17) 视觉还原基准
- 以 `research/screenshots/official_help/full.jpg`（官方五分区标注图）与 `ifanr_player.png`（2011 完整版）为最高基准；色值采用已采样锚点（报告第四节）。
- Logo 用 SVG 复刻品红双 L 音符 + 手写体"亦歌"（Google Fonts: Ma Shan Zheng），保留 Beta 角标。

## D5 (2026-11-17) 历史功能缺口处理
- 「学唱」：资料不足，一期实现为歌词窗口的卡拉 OK 高亮模式入口，UI 标注功能范围。
- 「上传歌曲」：一期为入口占位（原版允许用户传歌补充库），不接真实上传管道。
- 「亦歌吧」：外链百度贴吧占位，不伪造社区。
- 「有感而发/年度金曲」：mini 版功能，一期不进网页版（资料不足）。
