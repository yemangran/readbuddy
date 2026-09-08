import type { SelectionToolbarCustomActionOutputField } from "@/types/config/selection-toolbar"

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
  operation: "create" | "update" | "delete"
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
