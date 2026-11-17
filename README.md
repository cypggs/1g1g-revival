# 1g1g Revival —— 亦歌播放器复活计划

> 让亦歌（1g1g.com，2007-2012）那种「打开就能听、越听越懂你」的音乐体验在今天重新活过来。

## 快速开始

```bash
npm install
npm run build     # 构建前端到 web/dist
npm start         # 启动 http://localhost:3000
```

开发模式（前端热更新 5173 端口，API 代理到 3000）：

```bash
npm run dev
```

需要 Node.js ≥ 24（使用内置 node:sqlite，无原生依赖）。

## Docker

```bash
docker build -t 1g1g .
docker run -p 3000:3000 -v 1g1g-data:/app/data 1g1g
# 或
docker compose up
```

## 功能

- **打开即听**：首批 20 首经过真实可播放性验证的歌曲，VIP/版权歌曲绝不入列。
- **越听越懂**：行为信号加权（收藏/锁定/听完/跳过/拉黑）驱动推荐，多样性配额 50/20/30。
- **原版交互**：锁定轮底、播完移除、插第二位、双击下一首重解析源、悬停 ▶🔒★✕、快捷键 t/f/h/p/n/m。
- **收藏与附注**：跨设备收藏、搜索过滤、每页 13 分页。
- **歌词浮窗**：同步滚动、点击校准、拖拽缩放、位置记忆。
- **歌曲评论**：真实网易云评论面板。
- **分享直链**：`/歌手+歌曲名` 打开即播，如 `/周杰伦+晴天`。
- **手气不错**：每首歌附带诚实的推荐理由。
- **五套主题**：淡蓝/红/蓝/黑/Google 色，登录用户云端同步。

## 架构

```
server/           零依赖 Node http 服务（Node ≥ 24）
  netease.mjs     网易云双通道客户端（复用 mygo-web-cloudmusic 已验证实现）
  provider.mjs    搜索/批量可播放校验/歌词/评论/榜单
  radio.mjs       验证过的免费试听候选池（5 分钟缓存）
  recommend.mjs   推荐信号与画像（权重表 + 多样性配额）
  db.mjs          node:sqlite（用户/会话/收藏/历史/黑名单/事件/报告/源缓存）
  auth.mjs        scrypt 密码哈希 + HttpOnly Cookie 会话
  routes.mjs      全部 /api/* 路由
  index.mjs       静态资源 + API 网关，PORT 环境变量
web/              Vite + React 18 + TypeScript + Zustand
docs/             PROJECT_ANALYSIS.md / DECISIONS.md / PROGRESS.md
research/         亦歌考古报告
```

## 合规声明

- 仅使用网易云**公开可访问的免费试听**源，三条件校验（`url && size && !freeTrialInfo`）过滤 VIP 试听片段。
- 不进行任何破解、绕过付费校验或伪造身份。
- MV 仅跳转外部合法平台（B 站搜索）。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | 3000 | 监听端口 |
| `DATA_DIR` | ./data | SQLite 数据目录 |
| `DIST_DIR` | web/dist | 前端构建产物目录 |
