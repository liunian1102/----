# 微信/抖音小游戏移植可行性评估

> 日期:2026-11-15 · 依据:master `f91a84c` 实际代码扫描(非估计部分均附命令依据)
> 目的:为「小游戏 + 激励视频广告」变现路线做技术决策

## 一、结论摘要

| 维度 | 评估 |
|---|---|
| 核心战斗循环 | ✅ 可移植。纯 Canvas 渲染 + 固定步长循环,不依赖 DOM |
| 美术资源 | ✅ **已验证可移植**。spike 实测(2026-11-15,开发者工具 3.18.0):SVG data-url 解码成功且像素正确渲染,`art.js` 零改造。⚠️ 真机待复验 |
| 局外 UI(大厅/构筑/成就/星图/契约) | ❌ 需重写。7 个 DOM overlay + 2,301 行 CSS,小游戏无 DOM |
| 音频 | ✅ 低风险。WebAudio → `wx.createWebAudioContext`(基础库 2.19.0+) |
| 存档 | ✅ 低风险。6 处 localStorage 全部收敛在 `Store` 对象(第 1061 行) |
| 联机 | ⚠️ 需运维配合。`ws://` → `wss://` + 域名白名单 + ICP 备案 |
| 外部资源文件 | ✅ 零。无图片/音频/字体文件,全部代码内生成 |

**工期估计(业余时间)**:技术移植 5–7 周,备案/软著材料并行。**建议先做 2–3 天 spike 验证 SVG 解码,再决定是否全量投入。**

## 二、代码现状测量

| 指标 | 数值 |
|---|---|
| `game.js` | 21,768 行 |
| `art.js` | 1,170 行 |
| `style.css` | 2,301 行,392 条类规则 |
| `index.html` | 316 行(7 个 overlay 面板) |
| `document.*` 引用 | 224 处 |
| `getElementById` | 155 处 |
| `addEventListener` | 84 处 |
| DOM 密集代码块 | 19 处,合计跨度约 1,600 行(估算 2,000–2,500 行含上下文) |
| `new Image()` | 6 处(art.js 全部) |
| `AudioContext` | 3 处 |
| `new WebSocket` | 1 处 |
| `localStorage` | 6 处(全部经 `Store`) |
| `fetch` | 0 处 |
| `requestAnimationFrame` | 3 处 |

## 三、阻塞项分级

### P0-1 SVG 立绘解码 —— ✅ 已验证通过(2026-11-15)

`art.js:18-24` 全部角色/敌人/Boss/道具图都是 `data:image/svg+xml` → `new Image().src`。

**spike 实测结果**(`spike/wechat-svg-test/`,开发者工具 3.18.0,模拟 iOS):

```
[spike] PNG data-url [对照组]: LOAD OK 1x1 (4ms)
[spike] SVG data-url [关键]: LOAD OK 150x150 (3ms)
[spike] SVG 绘制像素 rgba(0,255,255,255) → 正常渲染 ✅
```

结论:小游戏 `wx.createImage` 支持 SVG data-url 且渲染正确,**art.js 无需预烤 PNG 管线**。
注意:SVG 未声明 width/height 时解码器给出 150x150 默认尺寸,`Art.sprite` 用 `drawImage` 显式目标尺寸,不受影响。
**遗留**:开发者工具与真机解码器实现可能不同,真机需复验同一测试(验证清单见第八节)。

### P0-2 DOM UI 体系重写

小游戏环境无 DOM,以下 7 个面板全部失效:

| 面板 | 入口 | 代码锚点 |
|---|---|---|
| 大厅 mpOverlay | 启动即显示 | index.html:19,game.js:21273+ 事件绑定 |
| 新手提示 tipsOverlay | 首次进入 | index.html:71 |
| 成就与外观 progressOverlay | 大厅按钮 | game.js:208 `renderProgressPanel` |
| 远征契约 contractOverlay | 大厅按钮 | game.js:21399+ |
| 永恒星图 metagrowthOverlay | 大厅按钮 | game.js:21366+ |
| 构筑 buildOverlay(角色/天赋树/宝石) | B/T 键 | game.js:16135–16700 |
| 结算 gameOver + D3 伤害图表 | 局末 | game.js:13464,13320 |

同类的 canvas 菜单(职业选择 12379、天赋三选 12956)已是 canvas 绘制,可作参照模板。
官方 `minigame-adapter` 只提供 DOM API 空壳、不做布局渲染,救不了这些面板。

**方案**:逐个改 canvas 面板(已有 `_withMenu` 菜单框架可复用)。预计 2–3 周,是本项目最大工程量。

### P1-1 音频

`Sound`(1691 行)/`Music`(1955 行)直接用 `AudioContext`。小游戏有 `wx.createWebAudioContext()`,API 兼容度高,预期只需在适配层做全局替换 + 首启手势解锁策略调整(小游戏的音频启动限制更严)。0.5–1 天。

### P1-2 输入与设备

- 键盘/鼠标 → 仅触摸。现有触摸系统(摇杆/点触、技能按钮)已完整,本项实际风险低;需移除键盘提示文案。
- `requestFullscreen`(:1102,2993)、`screen.orientation`(:1097,1111)、`matchMedia`(:1078):改为 manifest `deviceOrientation: landscape` + `wx.getSystemInfoSync()` 读取尺寸/安全区。
- `navigator.vibrate` → `wx.vibrateShort/vibrateLong`(Haptics 对象已是单点收敛,改 1 处)。
1–2 天。

### P1-3 存储

6 处 `localStorage` 全在 `Store`(:1061)。替换为 `wx.getStorageSync/setStorageSync` 即可。注意小游戏单 key 1MB / 总 10MB 限制,当前存档(`blockrun.profile` 等)远小于阈值。0.5 天。

### P1-4 联机

`server.js` 已是单进程 HTTP+WS,部署改动小:HTTPS/WSS + 证书。但小游戏对网络域名有硬性要求:**域名需 ICP 备案并加入微信后台白名单**,且不能连 IP:端口。这是运营/合规流程,不是代码工作,周期 1–4 周(视备案状态)。
若短期拿不到备案:第一期先发**单机版**(联机入口隐藏),不阻塞上线。

### P2 其他

- D3(:13320 结算图表)→ canvas 重写(原图很简单,柱状图 + 百分比),0.5 天。也可顺手移除 `d3` 运行时依赖。
- PWA(manifest.webmanifest、service worker 相关):小游戏不需要,移除。
- `EmojiArt.patchDom`(art.js MutationObserver):小游戏无 DOM,自动失效;`patchCanvas` 部分可用。
- 测试体系:现有 47 个 Node 测试大多与平台无关,保留;Playwright 浏览器测试在小游戏环境无法直接复用,需新增开发者工具自动化或手工真机清单。

## 四、实施路线(建议)

```
Spike(2-3 天) ──► 决策点 ──► Phase 1 单机可玩(1.5-2 周) ──► Phase 2 面板 canvas 化(2-3 周) ──► Phase 3 变现(1-1.5 周)
                     │
                     └─ SVG 不可解码 → 先做预烤 PNG 管线(+1-2 天)再进 Phase 1
```

**Phase 1**:平台适配层(`platform.js`:storage/audio/image/touch/socket 单点抽象)+ 核心战斗跑通 + 简化版 canvas 大厅(单人游戏/难度/开始)。目标:开发者工具 + 真机能打完整一局。
**Phase 2**:构筑(角色/天赋树/宝石)、成就与外观、契约、星图、结算图表全部 canvas 化。
**Phase 3**:账号(openid)+ 服务端存档 + 激励视频广告位(复活/结算双倍/换一批)+ 埋点。

**平台抽象层的意义**:微信/抖音同一套业务代码,差异收敛在 `platform.js`(`wx.*` / `tt.*`)。抖音小游戏可作为第二分发渠道,边际成本低。

## 五、广告位接入设计(Phase 3 详案)

| 变现位 | 代码锚点 | 规则 |
|---|---|---|
| 死亡复活 | `_checkLocalDeath()` :7893 | +1 life,每局限 1 次 |
| 结算双倍 | `_finishRunProgress()` :5733 | 星图材料 ×2,不强制 |
| 天赋重抽 | `_rerollsLeft`(每局 2 次) | 用完后 +1 次,上限 2 次 |
| 皮肤解锁 | `SKINS` :1236 + `Progress` | 低价皮肤可广告解锁,金色/棱镜保留成就 |

红线:不插屏、不强制、不打断战斗节奏。激励视频只出现在死亡/结算/菜单。

服务端新增(在现有 `server.js` 上加):
- `POST /api/login`(code2session 换 openid)
- `GET/POST /api/profile`(服务端存档,替代 localStorage 权威)
- `POST /api/reward`(广告回调发放,带次数/时效校验)
- `POST /api/run`(对局结果上报,做时长-分数包络校验防刷)
存储用 SQLite 即可,单进程无需引入框架。

## 六、合规清单(运营侧,与开发并行)

- [ ] 计算机软件著作权登记(软著)——个人可申请,普通流程 1–2 个月,加急约 1 周(付费)
- [ ] 微信小程序/小游戏备案(含游戏类目资质材料)
- [ ] 实名认证与防沉迷(小游戏平台强制,通常接入平台能力)
- [ ] 服务器域名 ICP 备案(联机必需;单机版不阻塞)
- [ ] 个人信息保护:收集 openid/设备信息需隐私协议
- [ ] 注意:内购需版号(个人开发者基本不可行)→ 本路线只做广告,不做内购

以上政策细节以微信官方最新要求为准,落地前逐项核对。

## 七、风险

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| SVG 无法解码(真机) | 低(工具端已验证) | 立绘全失 | 真机复验;失败则预烤 PNG 管线 |
| 面板 canvas 化超期 | 中 | 工期拉长 | Phase 2 可分批上线,先放单机 + 简化面板 |
| 域名备案周期长 | 中 | 联机延期 | 首发单机版 |
| 上线后无自然流量 | **高** | 变现归零 | 分享卡片 + 每日秘境回流设计,小规模投放测试 |
| 低端机性能不足 | 中 | 手感劣化 | 已内建自动降质(`_perfSample`);真机 FPS 实测后再调 |

## 八、Phase 1 启动骨架(已交付 2026-11-15)

目标:证明 `game.js` 能在小游戏环境启动、渲染、跑动。跳过 DOM 大厅,直接进入单人局。

| 文件 | 作用 |
|---|---|
| `minigame/shims.js` | 浏览器 API 垫片:canvas(上屏/离屏)、触摸事件、document/window 空壳、localStorage→wx 存储、Image→wx.createImage、AudioContext→wx.createWebAudioContext、震动、生命周期 |
| `minigame/boot.js` | 启动引导:直接 `new Game()` + `startGame()`,拦截结算改为屏幕提示 + 点击重开,叠加 FPS/实体数调试层 |
| `minigame/game.js` | 小游戏入口,`require('./bundle.js')` |
| `minigame/game.json` / `project.config.json` | 小游戏工程配置(竖屏、compileType: game) |
| `tools/build-minigame.js` | 打包:`shims → 环境注入 → art.js → game.js → boot.js` 拼成 `minigame/bundle.js`,再用 **esbuild 降到 ES2017**(约 990KB) |
| `tests/test-minigame-shim.js` | 冒烟测试:假 wx + 假 2D 上下文,验证启动、90 帧循环、存储桥接 |

### 验证状态

| 项 | 状态 |
|---|---|
| 打包 + 语法检查 | ✅ 本地验证 |
| 语法降级(无 `static X =` 残留) | ✅ 本地验证 + 回归测试 |
| Node 假运行时冒烟(启动/循环/存储) | ✅ `npm test` 48/0 |
| 开发者工具启动 | ✅ 已跑通(2026-11-16,垫片+注入修复后) |
| 真机运行 / 触摸手感 / 真机 FPS | ⏳ 待验证 |
| SVG 真机解码 | ⏳ 待验证 |
| DOM 面板可见性 | ❌ 已知缺失(空壳),Phase 2 处理 |

### 已知限制(骨架阶段)

- 大厅/构筑/成就/星图/契约面板**不可见**(DOM 空壳),相关功能全部不可用
- 结算改为自绘提示 + 点击重开
- 无联机(需 wss + 域名白名单)
- 键盘不可用(小游戏仅触摸),技能/冲刺/摇杆依赖已有触摸系统,未实测
