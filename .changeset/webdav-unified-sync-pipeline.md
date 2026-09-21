---
"@read-buddy/extension": minor
---

feat(webdav): sync dictionary, review states, and preferences in one coordinated pass

`syncWithWebdav` 现在是一次统一同步的编排入口：在生词本（`readbuddy.json`）同步落定后，同一轮中协同处理复习卡片状态（`readbuddy-reviews.json`）与插件偏好配置（`readbuddy-config.json`），本地写入防抖、启动、网络恢复、闹钟重试与手动「立即同步」都会走完整链路，一次配置 WebDAV 即可全局同步。

同步状态模型扩展记录偏好配置的同步结果与成功时间戳（`configSyncStatus`、`configLastSuccessTime`、`configLastAction`、`configLastError`）；同步返回值新增按组件划分的诊断报告（`components.dictionary` / `components.reviews` / `components.config`）：单个组件的非致命错误（如远端配置文件损坏、复习文件上传失败）不再阻断其他组件的正常同步，而是作为诊断信息向上暴露，学习数据照常同步。

WebDAV 同步由「双文件」演进为「三文件协同」，架构决策记录见 [ADR 0003](../docs/adr/0003-unified-webdav-sync-pipeline.md)（修订 ADR 0002 第 3 条）。
