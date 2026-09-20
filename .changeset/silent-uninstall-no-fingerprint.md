---
"@read-buddy/extension": patch
---

fix(background): uninstall flow no longer collects browser, OS or UI-language metadata

卸载时不再拼接扩展版本、浏览器类型与版本、操作系统及界面语言等设备指纹参数；跳转地址严格锁定为无查询参数的开源仓库 Issue 页面，其他取值一律静默卸载。
