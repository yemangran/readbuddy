---
"@read-buddy/extension": minor
---

feat(dictionary): 重构闪卡复习视窗为双栏工作台布局与优化同步入口

- `/options.html#/dictionary?mode=review` 页面全新升级为双栏工作台布局（方案 B）：左侧提供常驻复习卡片队列（展示单词、词性、过关状态、总体复习进度及已过关/待复习统计），支持即时点选跳转；右侧承载沉浸式卡片学习与记忆稳定性展示。
- 优化全屏复习页顶栏返回导航，移除右侧冗余关闭按钮。
- `/preference/webdav-sync` 移除多余的「偏好配置同步」区域，统一收敛至页面主同步通道。
