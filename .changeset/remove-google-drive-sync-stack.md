---
"@read-buddy/extension": patch
---

refactor(webdav): excise the obsolete Google Drive sync stack

Google Drive 云端同步的最后一处残留已彻底清除：删除 `src/utils/google-drive/` 全套模块（OAuth 隐式授权、Drive appdata 客户端、三方冲突合并）、`google-drive-sync` 偏好页组件与冲突弹窗、`use-google-drive-auth` Hook、`google-drive-sync` Jotai Atoms，以及随之失去引用的 `use-unresolved-field`、`last-sync-time` atom 与 `lastSyncedConfig` 读写封装。

偏好设置的同步状态改由 WebDAV 统一链路自带的 `configSyncStatus` / `configLastSuccessTime` 描述，不再依赖 Google Drive 的 `lastSyncedConfig` 基线。同时从 `src/env/shared.ts` 移除 `WXT_GOOGLE_CLIENT_ID`——生产构建不再要求 Google 客户端 ID，扩展对 `accounts.google.com` 与 `www.googleapis.com` 的网络调用归零；`.env.example` 与 submit / release 工作流的对应变量一并移除，九个语言包中的 `options.preference.config.googleDrive.*` 词条全部删除。

新增源码级边界守卫测试，防止已删除的模块、存储键、环境变量、语言词条或 Google 同步端点重新混入代码库。
