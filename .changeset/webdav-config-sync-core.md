---
"@read-buddy/extension": minor
---

feat(webdav): sync extension preferences through WebDAV with local snapshot protection

新增 `readbuddy-config.json` 规范读写能力：插件偏好设置现在通过用户已配置的 WebDAV 目录同步，采用 `lastModifiedAt` 最后更新胜出策略——远端配置较新时自动生成本地历史备份快照再拉取应用，本地较新或远端无文件时自动上传，覆盖后通过存储监听广播通知各运行环境生效。
