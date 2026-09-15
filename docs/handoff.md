# Read Frog Local-First Personal Vocabulary Storage

## 1. 项目背景

这是基于 Read Frog 开源项目的个人 Fork。

项目地址：

https://github.com/mengxi-ream/read-frog

目标不是继续依赖 Read Frog 官方 Notebase 云服务，而是将 **个人生词 / 笔记 / Flashcard / SRS 数据改造成 Local-First 架构**。

核心目标：

> 本地数据永远是第一数据源，云端仅承担同步、备份和恢复职责。

最终希望实现：

```text
                    Read Frog
                        │
                        ▼
                Local-First Storage
                        │
                 ┌──────┴──────┐
                 │             │
                 ▼             ▼
             IndexedDB      Sync Engine
                               │
                 ┌─────────────┼──────────────┐
                 │             │              │
                 ▼             ▼              ▼
              WebDAV        Qiniu OSS     其他文件存储
              坚果云          七牛云       S3 / etc.
```

---

# 2. 为什么进行这个改造

Read Frog 当前 Notebase 是远程云端学习工作区。

官方文档显示：

- Custom AI Actions 可以产生结构化结果
- 结构化结果可以映射到 Notebase
- Notebase 可以保存 vocabulary、definition、example、translation、reading notes
- Notebase 可以生成 Flashcard
- Flashcard 支持 Again / Hard / Good / Easy 的 SRS 复习

这些功能正好是本项目需要保留的核心学习能力。

但是本 Fork 的目标是：

```text
不依赖 Read Frog 官方 Notebase
不依赖 Read Frog 账号
不受官方 Notebase 数量限制
个人学习数据完全由用户控制
支持离线使用
支持自主备份
支持多个文件云存储后端
```

因此：

> 不应该简单地把官方 Notebase API 替换成某一个云服务 API。

应该建立一层独立的 Storage Domain。

---

# 3. 总体设计原则

## 3.1 Local First

所有学习数据首先写入本地。

流程：

```text
用户保存生词
      │
      ▼
Local Database
      │
      ├── 成功 → UI 立即更新
      │
      └── 异步 Sync
              │
              ▼
          Cloud Backup
```

云端不可用时：

```text
本地仍然可以：

- 保存生词
- 查询生词
- 编辑生词
- 删除生词
- 创建 Flashcard
- SRS 复习
- 修改复习状态
```

云端恢复后再同步。

---

# 4. 不允许的架构

不要实现成：

```text
Read Frog
   ↓
Qiniu API
   ↓
JSON
```

也不要实现成：

```text
Read Frog
   ↓
WebDAV
   ↓
坚果云
```

原因：

文件存储不应该成为运行时数据库。

七牛云 / WebDAV / S3 等应该属于：

```text
Backup / Sync Layer
```

而不是：

```text
Primary Database
```

---

# 5. 推荐最终架构

```text
┌──────────────────────────────────────────┐
│              Read Frog UI                │
│                                          │
│ Translation / AI Action / Vocabulary    │
│ Flashcard / Review / Settings           │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│              Domain Layer                │
│                                          │
│ Vocabulary                              │
│ Note                                    │
│ Flashcard                               │
│ ReviewState                              │
│ SyncMetadata                             │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│          Local Storage Repository        │
│                                          │
│ IndexedDB                                │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│              Sync Engine                 │
│                                          │
│ Change Detection                         │
│ Upload                                   │
│ Download                                 │
│ Conflict Detection                       │
│ Merge                                    │
│ Retry                                    │
│ Queue                                    │
└───────────────┬─────────────┬────────────┘
                │             │
                ▼             ▼
        ┌──────────────┐ ┌──────────────┐
        │ WebDAV       │ │ Qiniu OSS    │
        │              │ │              │
        │ 坚果云       │ │ 七牛云       │
        └──────────────┘ └──────────────┘
                │
                ▼
        Future Providers
        S3 / R2 / MinIO
```

---

# 6. 数据分层

不要把所有数据塞进一个简单的 JSON 对象。

至少分成以下几个 Domain。

## 6.1 Vocabulary

表示一个学习对象 / 生词。

```typescript
interface Vocabulary {
  id: string

  word: string

  language?: string

  phonetic?: string

  definitions: string[]

  translation?: string

  examples: VocabularyExample[]

  note?: string

  tags: string[]

  source?: VocabularySource

  createdAt: number

  updatedAt: number

  deletedAt?: number
}
```

---

## 6.2 Example

```typescript
interface VocabularyExample {
  sentence: string

  translation?: string

  source?: string
}
```

---

## 6.3 Source

记录这个生词来自哪里。

```typescript
interface VocabularySource {
  url?: string

  title?: string

  selectedText?: string

  paragraph?: string

  capturedAt?: number
}
```

---

# 7. Flashcard

Flashcard 不应该和 Vocabulary 强绑定成一个对象。

```typescript
interface Flashcard {
  id: string

  vocabularyId: string

  templateId?: string

  front: string

  back: string

  createdAt: number

  updatedAt: number

  deletedAt?: number
}
```

这样未来可以：

```text
一个 vocabulary
      │
      ├── English → Chinese card
      ├── Chinese → English card
      ├── Cloze card
      └── Example card
```

---

# 8. SRS Review State

复习状态独立保存。

```typescript
interface ReviewState {
  cardId: string

  dueAt: number

  interval: number

  easeFactor?: number

  repetitions: number

  lapses: number

  lastReviewedAt?: number

  lastRating?: ReviewRating

  updatedAt: number
}
```

其中：

```typescript
type ReviewRating = "again" | "hard" | "good" | "easy"
```

Read Frog 当前复习流程已经使用 Again / Hard / Good / Easy，因此新的 Local Storage 应保留这种语义。

如果现有项目已经存在 FSRS 相关实现：

> 不要重新实现 SRS 算法。

直接复用现有 scheduler。

---

# 9. Storage Repository

建立统一 Repository。

建议：

```typescript
interface VocabularyRepository {
  get(id: string): Promise<Vocabulary | null>

  list(options?: VocabularyListOptions): Promise<Vocabulary[]>

  create(vocabulary: Vocabulary): Promise<void>

  update(vocabulary: Vocabulary): Promise<void>

  delete(id: string): Promise<void>
}
```

Flashcard：

```typescript
interface FlashcardRepository {
  get(id: string): Promise<Flashcard | null>

  list(options?: FlashcardListOptions): Promise<Flashcard[]>

  create(card: Flashcard): Promise<void>

  update(card: Flashcard): Promise<void>

  delete(id: string): Promise<void>
}
```

Review：

```typescript
interface ReviewRepository {
  get(cardId: string): Promise<ReviewState | null>

  upsert(state: ReviewState): Promise<void>

  listDue(now: number): Promise<ReviewState[]>
}
```

---

# 10. Storage Adapter

Repository 不应该直接依赖 IndexedDB。

建立 Storage Adapter。

```typescript
interface LocalStorageAdapter {
  get<T>(collection: string, id: string): Promise<T | null>

  list<T>(collection: string): Promise<T[]>

  put<T>(collection: string, id: string, value: T): Promise<void>

  delete(collection: string, id: string): Promise<void>

  clear(collection: string): Promise<void>
}
```

第一阶段实现：

```text
IndexedDBAdapter
```

不要实现：

```text
QiniuDatabaseAdapter
WebDAVDatabaseAdapter
```

---

# 11. 为什么选择 IndexedDB

浏览器扩展环境优先使用 IndexedDB。

原因：

- 浏览器原生支持
- 异步 API
- 数据容量远大于 localStorage
- 可以建立索引
- 适合大量 vocabulary
- 支持离线
- 不需要额外服务器
- 非常适合 Local-First

不要使用：

```text
localStorage
```

作为核心学习数据数据库。

localStorage 可以继续用于：

```text
UI Settings
Small Preferences
Feature Flags
```

但不用于：

```text
Vocabulary
Flashcards
Review History
```

---

# 12. IndexedDB Schema

建议至少：

```text
Database: readfrog-local
```

Object Stores：

```text
vocabularies
flashcards
reviews
metadata
sync_changes
```

---

# 13. Metadata

```typescript
interface LocalMetadata {
  key: string

  value: unknown

  updatedAt: number
}
```

用于：

```text
schemaVersion
deviceId
lastSyncAt
storageVersion
migrationVersion
```

---

# 14. Device ID

每个安装实例生成：

```typescript
deviceId: string
```

例如：

```text
rf_01J...
```

必须持久化。

用途：

```text
Conflict detection
Change tracking
Sync debugging
```

---

# 15. 不要依赖时间戳作为唯一 ID

Vocabulary ID / Card ID 应该使用 UUID / ULID。

推荐：

```text
UUID
```

或者：

```text
ULID
```

不要：

```text
Date.now()
```

作为主 ID。

---

# 16. 删除必须使用 Tombstone

不能直接：

```text
delete vocabulary
```

然后同步时什么都不知道。

应该：

```typescript
{
  id: "...",
  deletedAt: 1788768000000
}
```

云端同步完成后，再根据策略进行 GC。

否则会出现：

```text
Device A 删除
Device B 仍然存在
Sync
Device B 又把数据恢复
```

---

# 17. Change Tracking

建立：

```typescript
interface ChangeRecord {
  id: string

  entityType: "vocabulary" | "flashcard" | "review"

  entityId: string

  operation: "create" | "update" | "delete"

  timestamp: number

  deviceId: string
}
```

用于同步。

---

# 18. Sync Provider

定义统一接口：

```typescript
interface SyncProvider {
  readonly id: string

  readonly name: string

  connect(config: unknown): Promise<void>

  testConnection(): Promise<SyncTestResult>

  download(): Promise<RemoteSnapshot | null>

  upload(snapshot: RemoteSnapshot): Promise<void>

  disconnect(): Promise<void>
}
```

第一阶段只需要：

```text
WebDAVProvider
```

第二阶段：

```text
QiniuProvider
```

以后：

```text
S3Provider
CloudflareR2Provider
MinIOProvider
```

---

# 19. Remote Snapshot

不要让不同云服务自己决定数据结构。

统一：

```typescript
interface RemoteSnapshot {
  format: "readfrog-local"

  version: number

  deviceId?: string

  updatedAt: number

  vocabularies: Vocabulary[]

  flashcards: Flashcard[]

  reviews: ReviewState[]

  metadata?: Record<string, unknown>
}
```

---

# 20. 文件格式

第一阶段：

```text
readfrog.json
```

例如：

```json
{
  "format": "readfrog-local",
  "version": 1,
  "updatedAt": 1788768000000,
  "vocabularies": [],
  "flashcards": [],
  "reviews": []
}
```

这个文件应该：

- 人类可读
- 可以手工备份
- 可以 Git 管理
- 可以迁移
- 可以恢复
- 不依赖任何服务器

---

# 21. 建议增加 manifest

为了以后扩展多文件存储，可以：

```text
readfrog/
  manifest.json
  data.json
```

manifest：

```json
{
  "format": "readfrog-local",
  "version": 1,
  "updatedAt": 1788768000000,
  "dataFile": "data.json"
}
```

第一阶段不需要拆成很多文件。

数据量小的时候：

```text
一个 JSON
```

是最可靠的。

---

# 22. WebDAV Provider

目标：

支持：

```text
坚果云
Nextcloud
ownCloud
其他标准 WebDAV 服务
```

不要写：

```text
NutstoreProvider
```

而应该写：

```text
WebDAVProvider
```

坚果云只是 WebDAV 的一个具体服务。

配置：

```typescript
interface WebDAVConfig {
  endpoint: string

  username: string

  password: string

  remotePath: string
}
```

例如：

```text
/ReadFrog/readfrog.json
```

---

# 23. WebDAV 操作

Provider 最少支持：

```text
GET
PUT
HEAD
```

可选：

```text
MKCOL
DELETE
```

同步时：

```text
HEAD remote file
        ↓
判断是否存在
        ↓
GET
        ↓
解析 JSON
```

上传：

```text
serialize
   ↓
PUT
```

---

# 24. WebDAV 凭据安全

非常重要。

不要把：

```text
WebDAV password
```

明文写入：

```text
readfrog.json
```

也不要同步到云端。

凭据属于：

```text
Local Secrets
```

数据属于：

```text
Sync Data
```

必须分离。

---

# 25. 七牛云 Provider

实现：

```typescript
QiniuProvider implements SyncProvider
```

使用对象存储。

例如：

```text
bucket:
readfrog-personal

object:
readfrog/user-data.json
```

---

# 26. 七牛云不应该成为数据库

禁止：

```text
每保存一个单词
    ↓
PUT Qiniu
```

这样会造成：

- 请求过多
- 网络延迟
- 数据竞争
- 云端写入失败影响 UI

正确：

```text
保存生词
   ↓
IndexedDB
   ↓
UI 立即完成
   ↓
后台 Sync
```

可以采用 debounce：

```text
最后一次修改后 2~5 秒
```

再触发同步。

---

# 27. Sync Queue

建立：

```typescript
interface SyncQueueItem {
  id: string

  operation: "upload" | "download"

  providerId: string

  createdAt: number

  retryCount: number

  nextRetryAt?: number
}
```

失败后：

```text
1s
2s
5s
10s
30s
60s
```

指数退避。

---

# 28. 同步触发机制

支持：

```text
1. 手动同步
2. 应用启动同步
3. 修改后 debounce 同步
4. 浏览器空闲时同步
5. 网络恢复后同步
```

但不要阻塞主业务。

---

# 29. 同步状态

UI 应该显示：

```text
已同步
正在同步...
同步失败
等待重试
从未同步
```

例如：

```text
☁ 已同步
```

或者：

```text
☁ 2 分钟前同步
```

失败：

```text
⚠ 同步失败
```

点击可以查看错误。

---

# 30. 冲突处理

这是整个系统最重要的部分之一。

假设：

```text
电脑 A
Vocabulary X
updatedAt = 100
```

手机：

```text
Vocabulary X
updatedAt = 110
```

同步：

```text
local = 100
remote = 110
```

可以采用：

```text
Last Write Wins
```

第一阶段建议：

> 对单条实体使用 `updatedAt` + `deviceId` 进行确定性比较。

规则：

```text
updatedAt 更大 → 更新
updatedAt 相同 → deviceId 字典序更大者胜出
```

这样结果确定。

---

# 31. 但是 ReviewState 不应该简单 LWW

Review 是特殊数据。

例如：

```text
电脑：
Good
```

手机：

```text
Hard
```

两个操作实际上都是有效学习行为。

长期版本可以保存：

```text
Review Event
```

例如：

```typescript
interface ReviewEvent {
  id: string

  cardId: string

  rating: ReviewRating

  reviewedAt: number

  deviceId: string
}
```

然后：

```text
Review Events
       ↓
Replay
       ↓
Current ReviewState
```

这是更可靠的设计。

---

# 32. 第一阶段可以简化

MVP：

```text
ReviewState
    ↓
LWW
```

第二阶段：

```text
ReviewEvent
    ↓
Event Merge
    ↓
SRS State
```

不要第一阶段过度设计。

---

# 33. Backup 和 Sync 必须区分

这是本项目非常重要的设计原则。

### Sync

目标：

```text
多设备保持一致
```

例如：

```text
电脑 ↔ 坚果云 ↔ 另一台电脑
```

### Backup

目标：

```text
防止数据损坏
```

例如：

```text
readfrog-2026-09-07.json
readfrog-2026-09-08.json
readfrog-2026-09-09.json
```

---

# 34. Backup Policy

建议：

```text
每次重大数据变化
或者
每天最多一次
```

创建：

```text
backup/
  2026-09-07T10-00-00.json
  2026-09-08T10-00-00.json
```

保留：

```text
最近 7 份
```

以后可以设置：

```text
7
30
90
无限
```

---

# 35. 多 Provider Backup

最终可以支持：

```text
Primary Sync
    ↓
WebDAV

Backup
    ↓
Qiniu
```

例如：

```text
坚果云
   │
   └── 主同步

七牛云
   │
   └── 自动备份

本地
   │
   └── 本地 IndexedDB
```

形成：

```text
3 copies
2 storage types
1 local copy
```

非常适合个人知识库。

---

# 36. 文件导入导出

必须提供：

```text
导出数据
导入数据
```

UI：

```text
设置
 └── 数据
      ├── 导出全部数据
      ├── 导入数据
      ├── 创建备份
      ├── 恢复备份
      └── 清除本地数据
```

导出格式：

```text
readfrog.json
```

---

# 37. 导入必须 Migration

未来：

```text
version = 1
version = 2
version = 3
```

导入：

```text
detect version
      ↓
migration
      ↓
validate
      ↓
import
```

不要直接：

```text
JSON.parse()
```

然后写数据库。

---

# 38. 数据校验

建立：

```text
Schema Validation
```

可以使用项目已经存在的 schema 工具。

如果项目没有合适工具，可以考虑：

```text
Zod
```

但先检查现有依赖，不要无意义增加依赖。

校验：

```text
format
version
required fields
types
IDs
timestamps
```

---

# 39. AI Action 改造

当前流程：

```text
Selected Text
      ↓
Custom AI Action
      ↓
Structured Output
      ↓
Notebase Mapping
      ↓
Remote Notebase
```

改成：

```text
Selected Text
      ↓
Custom AI Action
      ↓
Structured Output
      ↓
Local Vocabulary Mapping
      ↓
IndexedDB
```

用户体验保持：

```text
选中单词
 ↓
Dictionary
 ↓
结果
 ↓
保存
```

但保存目标变成：

```text
本地词库
```

---

# 40. Notebase UI 的处理方式

不要立即删除 Notebase 相关 UI。

第一阶段：

```text
Notebase
```

可以逐步重命名为：

```text
Vocabulary
```

或者：

```text
My Library
```

但内部迁移应该分阶段完成。

原因：

现有项目可能存在大量：

```text
notebase
notebaseId
notebase schema
notebase mappings
notebase cards
```

直接删除容易产生大量回归问题。

---

# 41. 推荐迁移策略

### Phase 1

增加：

```text
Local Vocabulary
```

但保留：

```text
Remote Notebase
```

作为兼容模式。

---

### Phase 2

增加：

```text
Storage Mode

Local
Remote
Local + Remote
```

---

### Phase 3

默认：

```text
Local First
```

---

### Phase 4

如果个人 Fork 不需要官方服务：

删除：

```text
Remote Notebase dependency
```

---

# 42. 兼容模式

建议：

```typescript
type StorageMode = "local" | "remote" | "hybrid"
```

默认：

```text
local
```

个人 Fork 最终可以只保留：

```text
local
hybrid
```

---

# 43. Settings UI

建议新增：

```text
设置
└── 数据存储
    │
    ├── 数据位置
    │    ├── ● 本地优先
    │    └── ○ 官方云端
    │
    ├── 同步
    │    ├── 自动同步
    │    ├── 手动同步
    │    └── 同步频率
    │
    ├── 云存储
    │    ├── 坚果云 / WebDAV
    │    ├── 七牛云
    │    └── 添加其他存储
    │
    ├── 备份
    │    ├── 自动备份
    │    ├── 手动备份
    │    ├── 保留数量
    │    └── 恢复
    │
    └── 数据
         ├── 导出
         ├── 导入
         └── 清除
```

---

# 44. Provider UI

不要把界面写死成：

```text
坚果云
七牛云
```

应该：

```text
添加存储
```

然后：

```text
Storage Type

○ WebDAV
○ Qiniu
○ S3
```

这样以后可以扩展。

---

# 45. WebDAV UI

配置：

```text
服务地址
用户名
密码
远程路径
```

例如：

```text
WebDAV URL:
https://dav.jianguoyun.com/dav/

Username:
xxxx

Password:
xxxx

Path:
/ReadFrog/readfrog.json
```

注意：

不要在 UI 或日志中输出密码。

---

# 46. Qiniu UI

配置：

```text
Region
Bucket
Access Key
Secret Key
Object Path
```

Secret Key 必须：

```text
仅本地保存
```

绝不能：

```text
同步到 readfrog.json
```

---

# 47. 日志系统

增加：

```text
Sync Logger
```

但禁止打印：

```text
password
secretKey
accessToken
API key
WebDAV credentials
```

允许：

```text
provider
operation
duration
status
error type
```

例如：

```text
[Sync] WebDAV upload started
[Sync] WebDAV upload success
[Sync] Qiniu backup failed: network error
```

---

# 48. 错误分类

至少区分：

```text
NetworkError
AuthenticationError
PermissionError
ConflictError
InvalidDataError
StorageError
UnknownError
```

UI 不应该直接显示：

```text
TypeError: fetch failed...
```

应该显示：

```text
坚果云同步失败：网络连接失败，将自动重试。
```

---

# 49. Offline

断网情况下：

```text
所有本地操作正常
```

同步：

```text
queued
```

网络恢复：

```text
automatic retry
```

不要因为：

```text
cloud unavailable
```

阻塞：

```text
save vocabulary
```

---

# 50. Browser Extension 特殊要求

这是浏览器扩展项目。

需要考虑：

```text
background/service worker
content script
options page
popup
```

Local Storage Repository 应该统一。

不要让：

```text
content script
```

直接操作：

```text
IndexedDB
```

然后：

```text
options page
```

又实现一套。

应该：

```text
UI
 ↓
Storage Service
 ↓
Repository
 ↓
IndexedDB
```

必要时通过：

```text
runtime messaging
```

统一访问。

---

# 51. 并发写入

可能存在：

```text
popup
content script
options page
background
```

同时修改。

必须考虑：

```text
transaction
```

和：

```text
updatedAt
```

避免：

```text
lost update
```

---

# 52. 数据库 Migration

IndexedDB 必须支持：

```text
DB_VERSION
```

例如：

```text
version 1
  ↓
version 2
  ↓
version 3
```

迁移必须：

```text
forward only
```

并且尽量：

```text
transactional
```

---

# 53. 不要一次性重写整个 Notebase

这是开发过程中的重要约束。

禁止：

```text
删除整个 Notebase
重新设计整个数据库
重新实现 Card
重新实现 SRS
重新实现 AI Action
```

应该：

```text
现有功能
    ↓
抽象 Storage
    ↓
Local Repository
    ↓
迁移 Notebase 数据
    ↓
Sync
```

---

# 54. 开发阶段

## Phase 0 — Codebase Reconnaissance

第一步不要修改代码。

先分析：

```text
Notebase
Custom AI Actions
Cards
Review
Storage
Settings
Backup
Google Drive Sync
Authentication
```

输出：

```text
docs/local-first/architecture.md
```

明确：

```text
当前数据模型
当前 API
当前调用链
当前状态管理
当前 Storage
当前 Notebase 边界
```

---

# 55. Phase 1 — Storage Abstraction

实现：

```text
Domain Models
Repository
LocalStorageAdapter
```

此阶段：

```text
不接云
不删除 Notebase
```

目标：

```text
单元测试通过
```

---

# 56. Phase 2 — IndexedDB

实现：

```text
IndexedDBAdapter
```

支持：

```text
CRUD
transaction
migration
index
```

然后让 Vocabulary 首先切换到本地。

---

# 57. Phase 3 — Local Vocabulary

实现：

```text
Save Vocabulary
List Vocabulary
Search Vocabulary
Edit Vocabulary
Delete Vocabulary
```

然后：

```text
Custom AI Action
        ↓
Local Vocabulary
```

---

# 58. Phase 4 — Flashcards

迁移：

```text
Notebase Card
```

到：

```text
Local Flashcard
```

不要改变现有 Card Template 的用户体验。

---

# 59. Phase 5 — SRS

迁移：

```text
Review State
```

保留现有：

```text
Again
Hard
Good
Easy
```

如果现有代码使用 FSRS：

```text
直接复用
```

---

# 60. Phase 6 — Export / Import

实现：

```text
Export JSON
Import JSON
Validation
Migration
```

此时即使云同步完全没有实现：

> 用户已经拥有完整的数据自主权。

这是第一个重要里程碑。

---

# 61. Phase 7 — Sync Engine

实现：

```text
Change Tracking
Sync Queue
Sync Scheduler
Conflict Detection
Retry
```

然后：

```text
MockSyncProvider
```

进行测试。

---

# 62. Phase 8 — WebDAV

实现：

```text
WebDAVProvider
```

目标：

```text
坚果云
Nextcloud
ownCloud
```

都可以使用。

---

# 63. Phase 9 — Qiniu

实现：

```text
QiniuProvider
```

作为：

```text
Backup Provider
```

优先级低于 WebDAV。

---

# 64. Phase 10 — Backup

增加：

```text
Automatic Backup
Manual Backup
Restore
Retention
```

---

# 65. Phase 11 — Remove Official Dependency

最后才考虑删除：

```text
Official Notebase API
Official Notebase UI
Account dependency
```

只有确认：

```text
Local Vocabulary
Local Flashcards
Local SRS
Import / Export
WebDAV
Backup
```

全部稳定后再做。

---

# 66. MVP 定义

第一阶段不要追求所有功能。

MVP 只要求：

```text
[✓] IndexedDB
[✓] Vocabulary CRUD
[✓] Local Search
[✓] AI Action → Local Vocabulary
[✓] Flashcard
[✓] Existing SRS
[✓] Export JSON
[✓] Import JSON
[✓] WebDAV Sync
[✓] Manual Sync
[✓] Basic Conflict Detection
```

暂时不要求：

```text
[ ] Qiniu
[ ] Multi-provider simultaneous sync
[ ] Review Event sourcing
[ ] Advanced conflict UI
[ ] Automatic backup rotation
```

---

# 67. Definition of Done

## Local Storage

```text
[ ] 完全离线可保存
[ ] 完全离线可读取
[ ] 浏览器刷新后数据存在
[ ] 扩展重新加载后数据存在
[ ] IndexedDB migration 正常
```

## Vocabulary

```text
[ ] AI Action 可以保存
[ ] 可以搜索
[ ] 可以编辑
[ ] 可以删除
[ ] 删除可以同步
```

## Flashcard

```text
[ ] 可以创建
[ ] 可以复习
[ ] Again 正常
[ ] Hard 正常
[ ] Good 正常
[ ] Easy 正常
```

## Export

```text
[ ] Export 可用
[ ] Import 可用
[ ] Invalid JSON 会被拒绝
[ ] Version migration 正常
```

## Sync

```text
[ ] WebDAV 上传
[ ] WebDAV 下载
[ ] 断网不会影响本地
[ ] 网络恢复自动重试
[ ] 冲突不会静默丢数据
```

## Backup

```text
[ ] 可以手动创建
[ ] 可以恢复
[ ] 可以限制保留数量
```

---

# 68. 测试矩阵

必须测试：

```text
Chrome
Edge
Firefox
```

至少：

```text
Chrome
```

作为第一目标。

---

## Offline Test

```text
1. 断网
2. 保存 10 个单词
3. 创建 Flashcard
4. 完成 5 次 Review
5. 刷新扩展
6. 数据必须完整存在
```

---

## Sync Test

```text
Device A
   ↓
Save vocabulary
   ↓
Sync

Device B
   ↓
Download
   ↓
Vocabulary exists
```

---

## Conflict Test

```text
Device A
修改 Word A

Device B
修改 Word A

同时 Sync

结果：
不能静默丢失
```

---

# 69. 数据安全

原则：

```text
学习数据 ≠ 凭据
```

`readfrog.json`：

```text
可以包含：
Vocabulary
Flashcard
Review
Metadata
```

不能包含：

```text
API Key
Qiniu Secret Key
WebDAV Password
OAuth Refresh Token
```

---

# 70. 隐私原则

Local-First 的核心目标之一：

```text
Vocabulary
Reading history
Review history
Notes
```

默认不离开本地。

只有用户明确配置：

```text
WebDAV
Qiniu
S3
```

以后才上传。

---

# 71. 迁移现有官方 Notebase

需要提供：

```text
Remote Notebase
      ↓
Export
      ↓
Local Import
```

如果官方 API 可以直接获取：

```text
notes
cards
review state
```

则自动迁移。

否则：

```text
CSV / JSON
```

作为 fallback。

---

# 72. 一个重要设计：Provider 与 Backup Provider 分离

不要假设：

```text
一个 Provider = 一个用途
```

配置应该允许：

```typescript
interface StorageConfig {
  primarySyncProvider?: string

  backupProviders: string[]
}
```

例如：

```text
primarySyncProvider:
  webdav

backupProviders:
  qiniu
```

---

# 73. 推荐个人配置

最终个人使用建议：

```text
Primary:

IndexedDB
+
WebDAV / 坚果云

Backup:

Qiniu OSS

Manual Export:

readfrog.json
```

即：

```text
             IndexedDB
                 │
        ┌────────┴────────┐
        ▼                 ▼
     坚果云              七牛云
    主同步              备份
        │                 │
        └────────┬────────┘
                 ▼
           本地 JSON 导出
```

---

# 74. 为什么不建议只使用七牛云

七牛云非常适合：

```text
备份
```

但不适合直接作为：

```text
数据库
```

因此：

```text
IndexedDB = Database
WebDAV = Sync
Qiniu = Backup
```

是当前最合理的个人架构。

---

# 75. 为什么 WebDAV 应该优先实现

因为 WebDAV 是协议，而不是某一家公司的服务。

实现：

```text
WebDAVProvider
```

之后可以兼容：

```text
坚果云
Nextcloud
ownCloud
自建 WebDAV
其他 WebDAV 服务
```

这比直接写：

```text
JianguoyunProvider
```

价值高很多。

---

# 76. 为什么必须保留 JSON

即使以后有：

```text
WebDAV
Qiniu
S3
R2
MinIO
```

也必须保留：

```text
readfrog.json
```

因为它是：

```text
Portable Data Format
```

用户可以：

```text
下载
复制
备份
Git
迁移
分析
转换
```

而不会被某一个云服务锁定。

---

# 77. Codex / AI Agent 开发要求

开发 AI Agent 必须遵循：

```text
先读代码
→ 建立架构理解
→ 输出计划
→ 小步修改
→ 测试
→ 再继续
```

禁止：

```text
先重构
```

禁止：

```text
看到 Notebase 就全部删除
```

禁止：

```text
没有理解现有数据结构就重新设计
```

---

# 78. Agent 第一条任务

第一轮只允许做：

```text
Repository reconnaissance
```

要求 Agent：

```text
1. 找到 Notebase 所有入口
2. 找到 Notebase API client
3. 找到 Vocabulary 数据模型
4. 找到 Card 数据模型
5. 找到 Review 数据模型
6. 找到当前 Storage
7. 找到 Settings
8. 找到 Backup
9. 找到 Google Drive Sync
10. 找到 Custom AI Action → Notebase 的完整调用链
```

输出：

```text
docs/local-first/current-architecture.md
```

并且：

> 第一轮禁止修改业务代码。

---

# 79. Agent 第二轮任务

建立：

```text
docs/local-first/storage-design.md
```

内容：

```text
Domain Model
Repository
IndexedDB
Sync Provider
WebDAV
Qiniu
Backup
Conflict
Migration
```

确认后再开始编码。

---

# 80. Commit Strategy

建议：

```text
feat(storage): add local storage domain

feat(storage): add indexeddb repository

feat(vocabulary): save vocabulary locally

feat(cards): add local flashcards

feat(review): persist local review state

feat(sync): add sync engine

feat(sync): add webdav provider

feat(backup): add json export import

feat(backup): add qiniu provider
```

不要：

```text
feat: rewrite notebase
```

一次提交几千行。

---

# 81. 回滚策略

每一个阶段都必须能够独立回滚。

特别是：

```text
IndexedDB migration
```

和：

```text
Notebase migration
```

必须在修改前：

```text
自动备份
```

---

# 82. 最终目标

最终这个 Fork 不再是：

```text
Read Frog
+
官方 Notebase
```

而是：

```text
Read Frog
+
Personal Local Knowledge Base
+
Flashcards
+
SRS
+
Local-First Storage
+
WebDAV Sync
+
Qiniu Backup
```

用户的数据模型：

```text
我的生词
我的例句
我的阅读记录
我的笔记
我的卡片
我的复习历史
```

全部属于用户自己。

云服务只是：

```text
同步工具
备份工具
```

而不是：

```text
数据所有者
```

---

# 83. 第一阶段立即执行的任务

现在开始开发时，只执行下面的任务：

```text
TASK 001

Analyze the current Read Frog codebase.

Do NOT modify production code.

Find and document:

1. Notebase data model
2. Notebase API client
3. Custom AI Action → Notebase flow
4. Flashcard data model
5. SRS / Review implementation
6. Existing local storage implementation
7. Existing backup implementation
8. Existing Google Drive sync implementation
9. Existing configuration persistence
10. All relevant TypeScript types
11. All relevant repositories/services/hooks
12. All Notebase-related UI components

Produce:

docs/local-first/current-architecture.md

The document must contain:

- Current architecture
- Data flow
- Dependency graph
- Important files
- Existing reusable infrastructure
- Notebase boundaries
- Risks
- Recommended migration points

Do not rewrite existing architecture yet.

Do not delete Notebase.

Do not add IndexedDB yet.

Do not add WebDAV yet.

Do not add Qiniu yet.

After the analysis, provide a concise implementation plan for the next phase.
```

---

# 84. 第二阶段启动条件

只有当：

```text
current-architecture.md
```

完成并确认：

```text
Notebase
Cards
Review
Storage
Backup
Sync
```

的真实代码位置之后，才开始：

```text
TASK 002
```

建立：

```text
Storage Domain
Repository
IndexedDB abstraction
```

---

# 85. 最重要的原则

整个项目始终遵循：

```text
Local First
     ↓
Offline First
     ↓
Cloud Optional
     ↓
Portable Data
     ↓
Provider Independent
```

而不是：

```text
Cloud First
     ↓
Local Cache
```

这是本 Fork 和官方 Read Frog 产品架构最核心的区别。
