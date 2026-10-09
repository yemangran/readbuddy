---
"@read-buddy/extension": patch
---

feat(i18n): localize popup and translation hub titles

弹窗与翻译中心（Translation Hub）标签页的文档标题现在跟随界面语言：中文环境分别显示「弹窗 | 伴读书童」与「翻译中心 | 伴读书童」，在设置中切换界面语言后无需刷新即时更新；`<html lang>` 同步为当前界面语言，读屏软件按对应语言的发音规则朗读页面。弹窗标题主要见于浏览器历史记录与辅助技术。个别语言缺少标题词条时回退英文，不再显示残缺标题。
