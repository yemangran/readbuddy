---
"@read-buddy/extension": patch
---

refactor(background): remove the upstream website privileged channel and converge environment config

彻底移除专为上游商业官网注入的 guide.content 脚本及其特权通信通道：网页再也无法通过 postMessage 读取扩展固定状态、改写用户的目标语言配置或跟踪引导进度，后台的 newUserGuide 引导通信、相关消息协议与 guide 工具模块一并删除。环境变量中的上游官网域名与 Cookie 授权域（WXT_API_URL、WXT_WEBSITE_URL、WXT_OFFICIAL_SITE_ORIGINS、WXT_AUTH_COOKIE_DOMAINS）全部收敛移除，代理请求不再监听上游鉴权 Cookie，随之不再需要 cookies 权限；OpenRouter 的归属请求头改为指向本开源仓库。同时移除 readfrog.app 阅读器的划词桥接，划词工具栏不再响应任何外部页面的 selection 消息。
