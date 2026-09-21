---
"@read-buddy/extension": minor
---

feat(webdav): sync extension preferences through WebDAV with local snapshot protection

新增 `readbuddy-config.json` 规范读写能力：插件偏好设置现在通过用户已配置的 WebDAV 目录同步，采用 `lastModifiedAt` 最后更新胜出策略——远端配置较新时自动生成本地历史备份快照再拉取应用，本地较新或远端无文件时自动上传，覆盖后通过存储监听广播通知各运行环境生效。上传使用 ETag 条件请求（`If-Match` / `If-None-Match`）避免覆盖其他设备的并发修改，远端文件缺失 ETag、超出大小预算或信封字段不完整时暂停同步并保留双方数据原状。
