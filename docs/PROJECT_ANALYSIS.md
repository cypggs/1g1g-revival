# PROJECT_ANALYSIS.md — 1g1g Revival Phase 0 考察报告

日期：2026-11-17

## 1. 当前工作目录现状

`/Users/case/1g1g/` 为新建空项目，仅有：
- `research/1g1g-research.md` — 亦歌产品考古报告（需求基准）
- `research/screenshots/` — 20+ 张历史真实界面截图

无既有框架、无后端、无数据库、无构建工具。**技术选型自由，但音乐来源层必须复用 mygo-web-cloudmusic。**

## 2. mygo-web-cloudmusic 深度分析

仓库：https://github.com/cypggs/mygo-web-cloudmusic （已克隆至 /tmp 考察）

### 2.1 项目实质

该项目本身就是"亦歌风格"的衍生作品（README 明言：默认首页为"亦歌风格随机列表，服务端逐首验证匿名完整播放"）。它分两部分：

| 部分 | 技术 | 可复用性 |
|---|---|---|
| `website/` | SolidJS + TanStack Start (SSR) + server.mjs | **server.mjs 是核心资产**；前端 UI 为网易云风格侧边栏应用，与亦歌五分区布局完全不同，不复用 |
| Go 桌面客户端 | Go 1.27 + 系统托盘 | 不复用（项目目标是 Web） |

### 2.2 server.mjs 核心机制（必须原样移植的部分）

**双通道网易云 API 客户端：**
- 公开 Web API：`music.163.com/api/...`，form-urlencoded，Cookie 携带登录态（MUSIC_U/__csrf/NMTID）
- EAPI 加密通道：`interfacepc.music.163.com/eapi/...`，AES-128-ECB 加密（key `e82ckenh8dichen8`，magic `36cd479b6b5`，md5 盐 `nobody{path}use{json}md5forencrypt`），iPhone UA 伪装
- 会话：base64url JSON Cookie `mygo_session`，扫码登录换取 MUSIC_U
- 内存 TTL 缓存（`cached()`）

**VIP/可播放性验证逻辑（项目生命线，已验证可用）：**
```js
// /api/free-radio 的核心判定：
if (!stream?.url || !stream.size || stream.freeTrialInfo) continue
// 三条件缺一不可：
// 1. 有 URL  2. size>0  3. 无 freeTrialInfo（试听片段 = VIP 歌曲）
```
- 候选池来源：日推 `/api/v3/discovery/recommend/songs` + 三个官方榜单歌单（3778678 热歌榜、19723756 飙升榜、3779629 新歌榜），去重后随机，分批 100 首调用 eapi `/api/song/enhance/player/url/v1`（level=standard, encodeType=mp3）验证，取 30 首。
- `/api/stream?id=&level=`：单曲取流（exhigh/mp3），无 URL 时返回明确错误"可能需要会员或存在版权限制"。

**已有端点清单**：home / free-radio / playlist / search(cloudsearch) / suggest / stream / lyrics / comments / artist / album / account / user-playlists / fm / login-qr / login-qr-check / logout / like。

### 2.3 前端 player.ts 可借鉴逻辑

- HTML5 Audio 封装：timeupdate/durationchange/play/pause/waiting/canplay/error/ended 事件链
- MediaSession 集成（锁屏控制）
- 队列持久化到 localStorage（剥离 streamUrl 后保存）
- 音量记忆、单曲循环/列表循环
- `loadID` 递增防竞态（快速切歌时丢弃过期回调）

### 2.4 技术债务与缺口（改造点）

| 缺口 | 改造方案 |
|---|---|
| 无用户注册体系（仅网易云扫码登录） | 自建 email+密码注册（node:crypto scrypt），网易云登录降级为可选 Phase |
| 无数据库（一切靠 localStorage + 网易云 like） | node:sqlite（Node 24 内置，零原生依赖）建 users/favorites/notes/history/blocked_artists/settings/reports 等表 |
| 无推荐算法（free-radio 是随机验证池） | 自建信号采集 + 打分 + 多样性控制的推荐引擎 |
| 无歌词窗口/锁定/黑名单/附注 | 按亦歌考古规格全新实现 |
| SolidJS SSR 栈与亦歌 UI 不合 | 前端重写为 React+Vite SPA（用户规格允许）；服务端保留 mygo 的零依赖 node http 模式 |
| streamUrl 直出给前端（网易云 URL 会过期） | 增加同源音频代理 + 源健康检查 + 失败重取 |

## 3. 目标架构

```
1g1g/
├── package.json            # 根脚本：dev / build / start
├── server/
│   ├── index.mjs           # node http：静态 + API 路由（移植 mygo server.mjs）
│   ├── netease.mjs         # 网易云双通道客户端（原样移植）
│   ├── provider.mjs        # MusicProvider 适配层：search/detail/sources/verify/charts
│   ├── radio.mjs           # 免费电台候选池 + 批量验证（原样移植增强）
│   ├── recommend.mjs       # 推荐引擎：信号/画像/打分/多样性
│   ├── db.mjs              # node:sqlite 建表与迁移
│   ├── auth.mjs            # 注册/登录/scrypt/会话
│   └── routes.mjs          # 业务路由：收藏/附注/历史/黑名单/报告/设置
├── web/
│   └── src/
│       ├── components/     # player/playlist/browser/navigation/lyrics/user/settings
│       ├── stores/         # zustand：player/browser/user/recommend
│       ├── services/       # api client
│       ├── hooks/
│       ├── types/
│       └── styles/         # CSS Variables 五主题
└── docs/  research/
```

## 4. 开发路线（对齐任务书 Phase 0-7）

1. **Phase 1 UI 骨架**：五分区布局 + Logo + 五主题 + 播放列表视觉 + 响应式
2. **Phase 2 播放器**：列表引擎（首曲播放/滚动/锁定回底/补歌/长度限制/三模式/第二位插入/悬停操作）+ Audio 封装
3. **Phase 3 音乐接入**：移植 netease.mjs + free-radio + stream 代理 + VIP 过滤
4. **Phase 4 用户体系**：注册登录/收藏同步/附注/历史/黑名单
5. **Phase 5 推荐**：信号/画像/手气不错/自动补歌
6. **Phase 6 辅助**：歌词窗/分享/错误报告/快捷键
7. **Phase 7 验收**：真实播放测试 + 截图对比

## 5. 风险清单

| 风险 | 缓解 |
|---|---|
| 网易云 API 变动/封 IP | 全局限流缓存 + 失败冷却；EAPI 通道已验证较稳 |
| 匿名取流有日限额 | free-radio 池 5 分钟缓存 + 推荐复用池 |
| 音频 URL 过期（实测约 20 分钟） | 不直存 URL，播放时按需取流 + 失败自动重取 |
| 版权歌曲混入 | 三重过滤：freeTrialInfo + fee 字段 + 实际播放失败上报 |
| 亦歌原始像素级样式不可考 | 以官方五分区标注截图 + ifanr 全界面截图为准，色值已采样 |
