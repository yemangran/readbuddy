import type { SelectionToolbarCustomActionOutputField } from "@/types/config/selection-toolbar"
import type { ConfigSyncAction } from "@/utils/config/webdav-sync"

export interface LocalDictionaryColumn {
  id: string
  name: string
  position: number
  config?: Record<string, unknown>
}

export interface LocalDictionaryMapping {
  id: string
  localFieldId: string
  notebaseColumnId: string
  notebaseColumnNameSnapshot: string
}

export interface LocalDictionaryRecord {
  id: string
  createdAt: number
  updatedAt: number
  deviceId: string
  deletedAt?: number | null
  localRevision: string
  actionId: string
  actionName: string
  outputSchema: SelectionToolbarCustomActionOutputField[]
  result: Record<string, unknown>
  columns: LocalDictionaryColumn[]
  mappings: LocalDictionaryMapping[]
  cells: Record<string, string | number | null>
}

export type PortableDictionaryRecord = Omit<LocalDictionaryRecord, "localRevision">

export interface MetadataRecord {
  key: string
  value: unknown
}

export interface SyncChangeRecord {
  sequence?: number
  entityId: string
  entityType: "vocabulary"
  operation: "create" | "update" | "delete" | "purge"
  timestamp: number
  deviceId: string
  version: {
    id: string
    updatedAt: number
    deviceId: string
  }
}

export interface MutationReceiptRecord {
  requestId: string
  requestDigest: string
  result: unknown
  changeSequence: number
  createdAt: number
}

export type DictionaryErrorCode =
  | "INVALID_DATA"
  | "NOT_FOUND"
  | "EDIT_CONFLICT"
  | "REQUEST_ID_REUSED"
  | "QUOTA_EXCEEDED"
  | "STORAGE_UNAVAILABLE"
  | "UPGRADE_REQUIRED"

export interface DictionaryError {
  code: DictionaryErrorCode
  retryable: boolean
  message?: string
}

export type DictionaryReply<T> =
  | { ok: true; data: T; changeSequence: number }
  | { ok: false; error: DictionaryError }

export interface CreateVocabularyItem {
  id: string
  actionId: string
  actionName: string
  outputSchema: SelectionToolbarCustomActionOutputField[]
  result: Record<string, unknown>
  columns: LocalDictionaryColumn[]
  mappings: LocalDictionaryMapping[]
  cells: Record<string, string | number | null>
}

export interface CreateManyInput {
  requestId: string
  items: CreateVocabularyItem[]
}

export interface UpdateCellsInput {
  requestId: string
  id: string
  cells: Record<string, string | number | null>
  expectedRevision: string
}

export interface DeleteInput {
  requestId: string
  id: string
  expectedRevision: string
}

export interface ListInput {
  page?: number
  pageSize?: number
  search?: string
  actionId?: string
  deletedOnly?: boolean
}

export interface ListOutput {
  records: LocalDictionaryRecord[]
  total: number
  page: number
  pageSize: number
}

export interface DictionarySnapshotV1 {
  format: "readfrog-local"
  version: 1
  updatedAt: number
  vocabularies: PortableDictionaryRecord[]
  conflictVersions: PortableDictionaryRecord[]
}

export interface ImportPreviewResult {
  addedCount: number
  updatedCount: number
  deletedCount: number
  preservedCount: number
  unchangedCount: number
  addedConflictCount: number
  expectedSequence: number
  snapshotHash: string
  errors: string[]
}

export interface CommitImportInput {
  requestId: string
  snapshot: DictionarySnapshotV1
  expectedSequence: number
  snapshotHash: string
}

export interface CommitImportOutput {
  addedCount: number
  updatedCount: number
  deletedCount: number
  preservedCount: number
  addedConflictCount: number
}

export interface RestoreConflictVersionInput {
  requestId: string
  targetId?: string
  versionId: {
    id: string
    updatedAt: number
    deviceId: string
  }
}

export interface ListConflictVersionsInput {
  id: string
}

export interface RestoreDeletedInput {
  requestId: string
  id: string
}

export interface PurgeInput {
  requestId: string
  id: string
}

export interface WebdavConfig {
  endpoint: string
  username: string
  password: string
}

export type WebdavErrorCode =
  | "AUTH_FAILED"
  | "CORRUPTED_REMOTE"
  | "UNSUPPORTED_VERSION"
  | "INTEGRITY_CONFLICT"
  | "BUDGET_EXCEEDED"
  | "CONDITION_FAILED_MAX_RETRIES"
  | "CONDITION_NOT_SUPPORTED"
  | "PERMISSION_DENIED"
  | "NETWORK_ERROR"
  | "STORAGE_ERROR"

export interface WebdavError {
  code: WebdavErrorCode
  message: string
  retryable: boolean
}

export interface WebdavSyncStats {
  addedCount: number
  updatedCount: number
  deletedCount: number
  preservedCount: number
  addedConflictCount: number
}

/**
 * Outcome of one component of a unified WebDAV sync pass. Components are
 * independent: a failure here is a diagnostic, not a failure of the pass.
 */
export interface WebdavSyncComponentReport {
  ok: boolean
  remoteUploaded?: boolean
  localUpdated?: boolean
  error?: WebdavError
}

/** Config sync report, carrying what the reconciliation decided to do. */
export interface WebdavConfigSyncReport extends WebdavSyncComponentReport {
  action?: ConfigSyncAction
  /** A local history snapshot was taken because the remote config won. */
  backupCreated?: boolean
}

export interface WebdavSyncComponents {
  /** Absent when the pass never reached the dictionary component. */
  dictionary?: WebdavSyncComponentReport
  /** Present only when the review state sync is part of the pass. */
  reviews?: WebdavSyncComponentReport
  config?: WebdavConfigSyncReport
}

export interface WebdavSyncResult {
  ok: boolean
  remoteUploaded?: boolean
  localUpdated?: boolean
  stats?: WebdavSyncStats
  etag?: string | null
  error?: WebdavError
  /** Per-component diagnostics of one unified sync pass. */
  components?: WebdavSyncComponents
}

export interface ApplySyncMergeResult {
  localUpdated: boolean
  addedCount: number
  updatedCount: number
  deletedCount: number
  preservedCount: number
  addedConflictCount: number
  mergedSnapshot: DictionarySnapshotV1
  needsRemoteUpload: boolean
}

export type WebdavSyncPhase = "idle" | "syncing" | "paused" | "error"

/** Outcome of the config component in the most recent pass that attempted it. */
export type WebdavConfigSyncStatus = "idle" | "synced" | "failed"

export interface WebdavSyncState {
  phase: WebdavSyncPhase
  lastSuccessTime: number | null
  lastAttemptTime: number | null
  nextRetryTime: number | null
  retryCount: number
  pendingChangesCount: number
  lastError: WebdavError | null
  pausedReason: WebdavErrorCode | null
  /**
   * Last successful sync timestamp for review states (`readbuddy-reviews.json`).
   */
  reviewsLastSuccessTime: number | null
  /**
   * Outcome of the `readbuddy-config.json` component of the most recent pass
   * that attempted it. A pass that failed before reaching the config component
   * (dictionary auth/network error) leaves these untouched, so they keep
   * describing the last config sync that actually ran.
   */
  configSyncStatus: WebdavConfigSyncStatus
  configLastSuccessTime: number | null
  configLastAction: ConfigSyncAction | null
  configLastError: WebdavError | null
}

export interface RemoteSnapshotSummary {
  exists: boolean
  updatedAt?: number
  recordCount?: number
  conflictCount?: number
  etag?: string | null
}
