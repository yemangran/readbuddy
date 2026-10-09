---
"@read-buddy/extension": patch
---

feat(i18n): localize options page tab title and html lang

设置页标签标题与 `<html lang>` 现在跟随界面语言：中文环境显示「设置 | 伴读书童」，在设置中切换界面语言后无需刷新页面即时更新，读屏软件也按当前界面语言的发音规则朗读页面；个别语言缺少标题词条时回退英文，不再显示残缺标题。
