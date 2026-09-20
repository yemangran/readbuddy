# @read-buddy/extension

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
