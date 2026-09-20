---
"@read-buddy/extension": minor
---

refactor(popup,options): remove upstream blog polling and notification components

彻底移除针对外部博客 API 的请求与缓存轮询逻辑；移除 Popup 顶部的资讯通知小铃铛按钮，并将 Options 侧边栏的商业博客浮层替换为静态本地更新日志与发行版链接，完全消除不必要的外部网络请求与潜在失效外链。
