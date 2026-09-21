# @read-buddy/extension

## 1.2.0

### Minor Changes

- [`32e5eb3`](https://github.com/yemangran/readbuddy/commit/32e5eb31df03bbf53bdf566f734e7473255a1bf0) Thanks [@yemangran](https://github.com/yemangran)! - feat(dictionary): 重构闪卡复习视窗为双栏工作台布局与优化同步入口

  - `/options.html#/dictionary?mode=review` 页面全新升级为双栏工作台布局（方案 B）：左侧提供常驻复习卡片队列（展示单词、词性、过关状态、总体复习进度及已过关/待复习统计），支持即时点选跳转；右侧承载沉浸式卡片学习与记忆稳定性展示。
  - 优化全屏复习页顶栏返回导航，移除右侧冗余关闭按钮。
  - `/preference/webdav-sync` 移除多余的「偏好配置同步」区域，统一收敛至页面主同步通道。

- [`f2f94ed`](https://github.com/yemangran/readbuddy/commit/f2f94ed73fb011f4ecdc760bb29878fb73e18430) Thanks [@yemangran](https://github.com/yemangran)! - feat(webdav): sync extension preferences through WebDAV with local snapshot protection

  新增 `readbuddy-config.json` 规范读写能力：插件偏好设置现在通过用户已配置的 WebDAV 目录同步，采用 `lastModifiedAt` 最后更新胜出策略——远端配置较新时自动生成本地历史备份快照再拉取应用，本地较新或远端无文件时自动上传，覆盖后通过存储监听广播通知各运行环境生效。上传使用 ETag 条件请求（`If-Match` / `If-None-Match`）避免覆盖其他设备的并发修改，远端文件缺失 ETag、超出大小预算或信封字段不完整时暂停同步并保留双方数据原状。

- [`a333379`](https://github.com/yemangran/readbuddy/commit/a333379846722e666d170977e28bbfed90668728) Thanks [@yemangran](https://github.com/yemangran)! - feat(webdav): sync dictionary, review states, and preferences in one coordinated pass

  `syncWithWebdav` 现在是一次统一同步的编排入口：在本地词典记录（`readbuddy.json`）同步落定后，同一轮中协同处理复习卡片状态（`readbuddy-reviews.json`）与插件偏好配置（`readbuddy-config.json`），本地写入防抖、启动、网络恢复、闹钟重试与手动「立即同步」都会走完整链路，一次配置 WebDAV 即可全局同步。设置页支持独立的偏好配置手动同步，便于快捷调试与刷新配置（遵循 ADR 0003 决议 2 修订）。

  同步状态模型扩展记录各组件的独立同步结果与成功时间戳（`lastSuccessTime`、`reviewsLastSuccessTime`、`configSyncStatus`、`configLastSuccessTime`、`configLastAction`、`configLastError`）；同步返回值新增按组件划分的诊断报告（`components.dictionary` / `components.reviews` / `components.config`）：单个组件的非致命错误（如远端配置文件损坏、复习文件上传失败）不再阻断其他组件的正常同步，而是作为诊断信息向上暴露，学习数据照常同步。

  WebDAV 同步由「双文件」演进为「三文件协同」，架构决策记录见 [ADR 0003](../docs/adr/0003-unified-webdav-sync-pipeline.md)（修订 ADR 0002 第 3 条）。

- [`5fa9641`](https://github.com/yemangran/readbuddy/commit/5fa96412a936f51ca7317ce4972db54911051542) Thanks [@yemangran](https://github.com/yemangran)! - feat(options): 统一偏好页的 WebDAV 云端同步入口与配置同步状态

  `/preference` 配置分区移除割裂的 Google Drive 同步卡片与冲突解决弹窗，替换为统一的 WebDAV 云端同步入口：一眼可见连接状态（已连接 / 未配置 / 同步异常）、最近一次同步时间，以及运行完整统一链路的「立即同步」按钮，行末箭头下钻到 WebDAV 详情页。

  `/preference/webdav-sync` 详情页新增「偏好配置同步」概览：展示 `readbuddy-config.json` 的同步状态、最近同步时间、上一轮同步动作（已上传至云端 / 已应用云端配置 / 已是最新）与失败原因，并提供独立于全局同步的「同步配置」按钮——只协调偏好配置，不动生词本与复习数据；偏好配置同步失败也绝不会暂停引擎或阻塞词典同步。

  架构决策记录见 [ADR 0003](../docs/adr/0003-unified-webdav-sync-pipeline.md)（修订第 2 条：新增显式的「仅偏好配置」触发器）。

### Patch Changes

- [`a294e4a`](https://github.com/yemangran/readbuddy/commit/a294e4a2d54537f0627a7488e988b1157dfafcf4) Thanks [@yemangran](https://github.com/yemangran)! - refactor(webdav): excise the obsolete Google Drive sync stack

  Google Drive 云端同步的最后一处残留已彻底清除：删除 `src/utils/google-drive/` 全套模块（OAuth 隐式授权、Drive appdata 客户端、三方冲突合并）、`google-drive-sync` 偏好页组件与冲突弹窗、`use-google-drive-auth` Hook、`google-drive-sync` Jotai Atoms，以及随之失去引用的 `use-unresolved-field`、`last-sync-time` atom 与 `lastSyncedConfig` 读写封装。

  偏好设置的同步状态改由 WebDAV 统一链路自带的 `configSyncStatus` / `configLastSuccessTime` 描述，不再依赖 Google Drive 的 `lastSyncedConfig` 基线。同时从 `src/env/shared.ts` 移除 `WXT_GOOGLE_CLIENT_ID`——生产构建不再要求 Google 客户端 ID，扩展对 `accounts.google.com` 与 `www.googleapis.com` 的网络调用归零；`.env.example` 与 submit / release 工作流的对应变量一并移除，九个语言包中的 `options.preference.config.googleDrive.*` 词条全部删除。

  新增源码级边界守卫测试，防止已删除的模块、存储键、环境变量、语言词条或 Google 同步端点重新混入代码库。

## 1.1.0

### Minor Changes

- [`03bd386`](https://github.com/yemangran/readbuddy/commit/03bd386dfc4e8ea07739f1a8fd834bf417858011) Thanks [@yemangran](https://github.com/yemangran)! - feat(side.content): floating button feedback opens the open-source issue tracker

  悬浮球「反馈」按钮不再跳转第三方商业反馈服务（Featurebase）：点击后直接打开开源仓库 Issue 页面，跳转地址无查询参数，不再序列化当前网页 URL、浏览器名称与扩展版本等设备信息。

- [`232cd10`](https://github.com/yemangran/readbuddy/commit/232cd107043df2efd080052f8faa3486fc77edc1) Thanks [@yemangran](https://github.com/yemangran)! - refactor(popup,options): remove upstream blog polling and notification components

  彻底移除针对外部博客 API 的请求与缓存轮询逻辑；移除 Popup 顶部的资讯通知小铃铛按钮，并将 Options 侧边栏的商业博客浮层替换为静态本地更新日志与发行版链接，完全消除不必要的外部网络请求与潜在失效外链。

- [`ddbf876`](https://github.com/yemangran/readbuddy/commit/ddbf876c76b20f165ace9b37f5765538e56b82ae) Thanks [@yemangran](https://github.com/yemangran)! - feat(options): strip upstream promotion and referral from provider configuration

  提供商配置不再夹带商业推广：API 提供商教程、翻译与字幕自定义 CSS 的外部文档链接全部移除（CSS 编辑器的占位提示中本就包含可用选择器指引）；Jalapeno Cloud 与 Atlas Cloud 的赞助徽章、推广 CTA、referUrl 推荐短链及赞助归属请求头一并删除，两个服务商的官网与 API Key 链接改为各自的规范主页，Jalapeno 的描述改回事实性文案。Popup 中的私域 Discord 社区按钮移除，社区入口统一为 GitHub；注入 jalapeno-cloud.ai 的合作伙伴 postMessage 桥接脚本也随之移除。

### Patch Changes

- [`1ef23bf`](https://github.com/yemangran/readbuddy/commit/1ef23bfd6aee31982d8455898db94608e0ebf4d3) Thanks [@yemangran](https://github.com/yemangran)! - feat(options): polish dictionary pagination and enhance WebDAV Jianguoyun setup guide

  优化生词本设置页面的分页条交互与数字导航，支持动词短语与名词短语词性标签展示；完善 WebDAV 坚果云配置指南，明确提示需在根目录手动创建 readbuddy 文件夹以便正常隔离同步。

- [`d615c6d`](https://github.com/yemangran/readbuddy/commit/d615c6dcf84104c60f959262f9dbdedb7589a862) Thanks [@yemangran](https://github.com/yemangran)! - refactor(background): remove the upstream website privileged channel and converge environment config

  彻底移除专为上游商业官网注入的 guide.content 脚本及其特权通信通道：网页再也无法通过 postMessage 读取扩展固定状态、改写用户的目标语言配置或跟踪引导进度，后台的 newUserGuide 引导通信、相关消息协议与 guide 工具模块一并删除。环境变量中的上游官网域名与 Cookie 授权域（WXT_API_URL、WXT_WEBSITE_URL、WXT_OFFICIAL_SITE_ORIGINS、WXT_AUTH_COOKIE_DOMAINS）全部收敛移除，代理请求不再监听上游鉴权 Cookie，随之不再需要 cookies 权限；OpenRouter 的归属请求头改为指向本开源仓库。同时移除 readfrog.app 阅读器的划词桥接，划词工具栏不再响应任何外部页面的 selection 消息。

- [`2e83275`](https://github.com/yemangran/readbuddy/commit/2e832752ab8d3f5e7071eb077101d1efaed64f8f) Thanks [@yemangran](https://github.com/yemangran)! - 初次安装扩展时不再自动打开外部导引页面：安装生命周期保持静默，不会发起任何外部网络跳转，扩展可离线即时可用。

- [`7eaa5cc`](https://github.com/yemangran/readbuddy/commit/7eaa5ccbe63cbb17f6a8b9117d42b76bb9035df3) Thanks [@yemangran](https://github.com/yemangran)! - fix(background): uninstall flow no longer collects browser, OS or UI-language metadata

  卸载时不再拼接扩展版本、浏览器类型与版本、操作系统及界面语言等设备指纹参数；跳转地址严格锁定为无查询参数的开源仓库 Issue 页面，其他取值一律静默卸载。

## 1.0.0

### Major Changes

- Initial 1.0.0 release of **Read Buddy (伴读书童)**:
  - **Local-First Architecture**: Complete decentralization, offline-first data storage, eliminating all upstream cloud servers, subscriptions, and accounts.
  - **FSRS Spaced Repetition Review Engine**: Scientifically guided flashcard review with popup study loop and full-screen immersive study view.
  - **Private WebDAV Dual-File Synchronization**: Seamless cross-device dictionary (`readbuddy.json`) and review states (`readbuddy-reviews.json`) synchronization with Last-Review-Wins conflict resolution.
  - **Full Rebranding**: Rebranded identity, clean logos, and customized multilingual locales.
