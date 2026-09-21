---
"@read-buddy/extension": minor
---

feat(options): 统一偏好页的 WebDAV 云端同步入口与配置同步状态

`/preference` 配置分区移除割裂的 Google Drive 同步卡片与冲突解决弹窗，替换为统一的 WebDAV 云端同步入口：一眼可见连接状态（已连接 / 未配置 / 同步异常）、最近一次同步时间，以及运行完整统一链路的「立即同步」按钮，行末箭头下钻到 WebDAV 详情页。

`/preference/webdav-sync` 详情页新增「偏好配置同步」概览：展示 `readbuddy-config.json` 的同步状态、最近同步时间、上一轮同步动作（已上传至云端 / 已应用云端配置 / 已是最新）与失败原因，并提供独立于全局同步的「同步配置」按钮——只协调偏好配置，不动生词本与复习数据；偏好配置同步失败也绝不会暂停引擎或阻塞词典同步。

架构决策记录见 [ADR 0003](../docs/adr/0003-unified-webdav-sync-pipeline.md)（修订第 2 条：新增显式的「仅偏好配置」触发器）。
