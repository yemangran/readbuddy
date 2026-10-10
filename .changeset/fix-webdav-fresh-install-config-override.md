---
"@read-buddy/extension": patch
---

fix(webdav): prevent fresh-install default config from overwriting remote preferences

全新安装扩展时，未编辑过的默认配置的时间戳（`lastModifiedAt`）不再被赋予安装当天的 `Date.now()`，而是保持为 `0`；当新浏览器连接已存有配置的 WebDAV 目录并进行同步时，系统会自动从云端拉取已配置的偏好与 API 供应商，防止空白默认配置反向覆盖云端。
