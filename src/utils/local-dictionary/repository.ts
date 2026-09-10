import type {
  ApplySyncMergeResult,
  CommitImportInput,
  CommitImportOutput,
  CreateManyInput,
  DeleteInput,
  DictionaryError,
  DictionaryReply,
  DictionarySnapshotV1,
  ImportPreviewResult,
  ListInput,
  ListOutput,
  LocalDictionaryRecord,
  PortableDictionaryRecord,
  PurgeInput,
  RestoreConflictVersionInput,
  RestoreDeletedInput,
  UpdateCellsInput,
} from "./types"
import { sha256 } from "js-sha256"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { type LocalDictionaryDB } from "./db"
import {
  canonicalStringify,
  compareRecordVersions,
  getVersionIdentityKey,
  reconcileRecordSets,
} from "./reconciler"
import { exportDictionarySnapshot, toPortableRecord } from "./snapshot"

function canonicalize(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val
  }
  if (Array.isArray(val)) {
    return val.map(canonicalize)
  }
  const obj = val as Record<string, unknown>
  const sortedKeys = Object.keys(obj).sort()
  const result: Record<string, unknown> = {}
  for (const key of sortedKeys) {
    result[key] = canonicalize(obj[key])
  }
  return result
}

export function computeRequestDigest(payload: unknown): string {
  const canonical = canonicalize(payload)
  return sha256(JSON.stringify(canonical))
}

export const MAX_CREATE_ITEMS = 500
export const MAX_RECORD_PAYLOAD_BYTES = 5 * 1024 * 1024 // 5MB

export class TransactionBusinessError extends Error {
  constructor(public readonly dictionaryError: DictionaryError) {
    super(dictionaryError.message)
    this.name = "TransactionBusinessError"
  }
}

export class LocalDictionaryRepository {
  constructor(private readonly db: LocalDictionaryDB) {}

  private async getOrInitMetadataWithinTx(): Promise<{ deviceId: string; changeSequence: number }> {
    let deviceIdRecord = await this.db.metadata.get("deviceId")
    if (!deviceIdRecord || typeof deviceIdRecord.value !== "string") {
      const newDeviceId = getRandomUUID()
      await this.db.metadata.put({ key: "deviceId", value: newDeviceId })
      deviceIdRecord = { key: "deviceId", value: newDeviceId }
    }

    let seqRecord = await this.db.metadata.get("changeSequence")
    if (!seqRecord || typeof seqRecord.value !== "number") {
      await this.db.metadata.put({ key: "changeSequence", value: 0 })
      seqRecord = { key: "changeSequence", value: 0 }
    }

    return {
      deviceId: deviceIdRecord.value as string,
      changeSequence: seqRecord.value as number,
    }
  }

  async getMetadata(): Promise<{ deviceId: string; changeSequence: number }> {
    return await this.db.transaction("rw", this.db.metadata, async () => {
      return await this.getOrInitMetadataWithinTx()
    })
  }

  async createMany(input: CreateManyInput): Promise<DictionaryReply<{ createdIds: string[] }>> {
    if (!input.items || input.items.length === 0) {
      return {
        ok: false,
        error: { code: "INVALID_DATA", retryable: false, message: "Cannot create empty items" },
      }
    }

    if (input.items.length > MAX_CREATE_ITEMS) {
      return {
        ok: false,
        error: {
          code: "INVALID_DATA",
          retryable: false,
          message: `Batch size (${input.items.length}) exceeds maximum limit of ${MAX_CREATE_ITEMS} items`,
        },
      }
    }

    const seenBatchIds = new Set<string>()
    for (const item of input.items) {
      if (seenBatchIds.has(item.id)) {
        return {
          ok: false,
          error: {
            code: "INVALID_DATA",
            retryable: false,
            message: `Duplicate item id in batch: "${item.id}"`,
          },
        }
      }
      seenBatchIds.add(item.id)

      const payloadBytes = JSON.stringify(item).length
      if (payloadBytes > MAX_RECORD_PAYLOAD_BYTES) {
        return {
          ok: false,
          error: {
            code: "INVALID_DATA",
            retryable: false,
            message: `Item "${item.id}" payload size (${payloadBytes} bytes) exceeds limit of ${MAX_RECORD_PAYLOAD_BYTES} bytes`,
          },
        }
      }
    }

    const digest = computeRequestDigest(input)

    try {
      return await this.db.transaction(
        "rw",
        [
          this.db.vocabularies,
          this.db.conflictVersions,
          this.db.metadata,
          this.db.syncChanges,
          this.db.mutationReceipts,
        ],
        async () => {
          // 1. Check receipt
          const existingReceipt = await this.db.mutationReceipts.get(input.requestId)
          if (existingReceipt) {
            if (existingReceipt.requestDigest === digest) {
              return {
                ok: true,
                data: existingReceipt.result as { createdIds: string[] },
                changeSequence: existingReceipt.changeSequence,
              }
            }
            return {
              ok: false,
              error: {
                code: "REQUEST_ID_REUSED",
                retryable: false,
                message: "Request ID already used with different payload",
              },
            }
          }

          // 2. Read metadata
          let deviceIdRecord = await this.db.metadata.get("deviceId")
          let deviceId = deviceIdRecord?.value as string
          if (!deviceId) {
            deviceId = getRandomUUID()
            await this.db.metadata.put({ key: "deviceId", value: deviceId })
          }

          let seqRecord = await this.db.metadata.get("changeSequence")
          let currentSeq = (seqRecord?.value as number) || 0

          // 3. Check for existing IDs across database
          for (const item of input.items) {
            const exists = await this.db.vocabularies.get(item.id)
            if (exists) {
              throw new TransactionBusinessError({
                code: "INVALID_DATA",
                retryable: false,
                message: `Record with id "${item.id}" already exists`,
              })
            }
          }

          // 4. Insert items
          const now = Date.now()
          const createdIds: string[] = []

          for (const item of input.items) {
            const record: LocalDictionaryRecord = {
              id: item.id,
              createdAt: now,
              updatedAt: now,
              deviceId,
              localRevision: getRandomUUID(),
              actionId: item.actionId,
              actionName: item.actionName,
              outputSchema: item.outputSchema,
              result: item.result,
              columns: item.columns,
              mappings: item.mappings,
              cells: item.cells,
            }

            await this.db.vocabularies.put(record)
            createdIds.push(record.id)

            await this.db.syncChanges.add({
              entityId: record.id,
              entityType: "vocabulary",
              operation: "create",
              timestamp: record.updatedAt,
              deviceId,
              version: {
                id: record.id,
                updatedAt: record.updatedAt,
                deviceId,
              },
            })
          }

          const nextSeq = currentSeq + 1
          await this.db.metadata.put({ key: "changeSequence", value: nextSeq })

          await this.db.mutationReceipts.put({
            requestId: input.requestId,
            requestDigest: digest,
            result: { createdIds },
            changeSequence: nextSeq,
            createdAt: now,
          })

          return {
            ok: true,
            data: { createdIds },
            changeSequence: nextSeq,
          }
        },
      )
    } catch (error: any) {
      if (error instanceof TransactionBusinessError || error?.name === "TransactionBusinessError") {
        return {
          ok: false,
          error: error.dictionaryError,
        }
      }
      if (error?.name === "QuotaExceededError") {
        return {
          ok: false,
          error: { code: "QUOTA_EXCEEDED", retryable: false, message: error.message },
        }
      }
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async updateCells(input: UpdateCellsInput): Promise<DictionaryReply<LocalDictionaryRecord>> {
    const digest = computeRequestDigest(input)

    try {
      return await this.db.transaction(
        "rw",
        [
          this.db.vocabularies,
          this.db.conflictVersions,
          this.db.metadata,
          this.db.syncChanges,
          this.db.mutationReceipts,
        ],
        async () => {
          // 1. Check receipt
          const existingReceipt = await this.db.mutationReceipts.get(input.requestId)
          if (existingReceipt) {
            if (existingReceipt.requestDigest === digest) {
              return {
                ok: true,
                data: existingReceipt.result as LocalDictionaryRecord,
                changeSequence: existingReceipt.changeSequence,
              }
            }
            return {
              ok: false,
              error: {
                code: "REQUEST_ID_REUSED",
                retryable: false,
                message: "Request ID already used with different payload",
              },
            }
          }

          // 2. Fetch record
          const existing = await this.db.vocabularies.get(input.id)
          if (!existing || existing.deletedAt) {
            return {
              ok: false,
              error: { code: "NOT_FOUND", retryable: false, message: "Record not found" },
            }
          }

          if (existing.localRevision !== input.expectedRevision) {
            return {
              ok: false,
              error: {
                code: "EDIT_CONFLICT",
                retryable: false,
                message: "Record was modified concurrently",
              },
            }
          }

          // 3. Metadata
          let deviceIdRecord = await this.db.metadata.get("deviceId")
          let deviceId = deviceIdRecord?.value as string
          if (!deviceId) {
            deviceId = getRandomUUID()
            await this.db.metadata.put({ key: "deviceId", value: deviceId })
          }

          let seqRecord = await this.db.metadata.get("changeSequence")
          let currentSeq = (seqRecord?.value as number) || 0

          const updatedAt = Math.max(Date.now(), existing.updatedAt + 1)
          const newRevision = getRandomUUID()

          const updatedRecord: LocalDictionaryRecord = {
            ...existing,
            cells: { ...input.cells },
            updatedAt,
            deviceId,
            localRevision: newRevision,
          }

          await this.db.vocabularies.put(updatedRecord)

          await this.db.syncChanges.add({
            entityId: updatedRecord.id,
            entityType: "vocabulary",
            operation: "update",
            timestamp: updatedAt,
            deviceId,
            version: {
              id: updatedRecord.id,
              updatedAt,
              deviceId,
            },
          })

          const nextSeq = currentSeq + 1
          await this.db.metadata.put({ key: "changeSequence", value: nextSeq })

          await this.db.mutationReceipts.put({
            requestId: input.requestId,
            requestDigest: digest,
            result: updatedRecord,
            changeSequence: nextSeq,
            createdAt: updatedAt,
          })

          return {
            ok: true,
            data: updatedRecord,
            changeSequence: nextSeq,
          }
        },
      )
    } catch (error: any) {
      if (error?.name === "QuotaExceededError") {
        return {
          ok: false,
          error: { code: "QUOTA_EXCEEDED", retryable: false, message: error.message },
        }
      }
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async delete(input: DeleteInput): Promise<DictionaryReply<{ id: string; deleted: boolean }>> {
    const digest = computeRequestDigest(input)

    try {
      return await this.db.transaction(
        "rw",
        [
          this.db.vocabularies,
          this.db.conflictVersions,
          this.db.metadata,
          this.db.syncChanges,
          this.db.mutationReceipts,
        ],
        async () => {
          // 1. Check receipt
          const existingReceipt = await this.db.mutationReceipts.get(input.requestId)
          if (existingReceipt) {
            if (existingReceipt.requestDigest === digest) {
              return {
                ok: true,
                data: existingReceipt.result as { id: string; deleted: boolean },
                changeSequence: existingReceipt.changeSequence,
              }
            }
            return {
              ok: false,
              error: {
                code: "REQUEST_ID_REUSED",
                retryable: false,
                message: "Request ID already used with different payload",
              },
            }
          }

          // 2. Fetch record
          const existing = await this.db.vocabularies.get(input.id)
          if (!existing || existing.deletedAt) {
            return {
              ok: false,
              error: { code: "NOT_FOUND", retryable: false, message: "Record not found" },
            }
          }

          if (existing.localRevision !== input.expectedRevision) {
            return {
              ok: false,
              error: {
                code: "EDIT_CONFLICT",
                retryable: false,
                message: "Record was modified concurrently",
              },
            }
          }

          // 3. Archive pre-deletion full record into conflictVersions
          const portableRecord: PortableDictionaryRecord = {
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
            deviceId: existing.deviceId,
            deletedAt: existing.deletedAt,
            actionId: existing.actionId,
            actionName: existing.actionName,
            outputSchema: existing.outputSchema,
            result: existing.result,
            columns: existing.columns,
            mappings: existing.mappings,
            cells: existing.cells,
          }
          await this.db.conflictVersions.put(portableRecord)

          // 4. Metadata
          let deviceIdRecord = await this.db.metadata.get("deviceId")
          let deviceId = deviceIdRecord?.value as string
          if (!deviceId) {
            deviceId = getRandomUUID()
            await this.db.metadata.put({ key: "deviceId", value: deviceId })
          }

          let seqRecord = await this.db.metadata.get("changeSequence")
          let currentSeq = (seqRecord?.value as number) || 0

          const deletedTimestamp = Math.max(Date.now(), existing.updatedAt + 1)
          const newRevision = getRandomUUID()

          const tombstoneRecord: LocalDictionaryRecord = {
            ...existing,
            deletedAt: deletedTimestamp,
            updatedAt: deletedTimestamp,
            deviceId,
            localRevision: newRevision,
          }

          await this.db.vocabularies.put(tombstoneRecord)

          await this.db.syncChanges.add({
            entityId: existing.id,
            entityType: "vocabulary",
            operation: "delete",
            timestamp: deletedTimestamp,
            deviceId,
            version: {
              id: existing.id,
              updatedAt: deletedTimestamp,
              deviceId,
            },
          })

          const nextSeq = currentSeq + 1
          await this.db.metadata.put({ key: "changeSequence", value: nextSeq })

          const result = { id: existing.id, deleted: true }
          await this.db.mutationReceipts.put({
            requestId: input.requestId,
            requestDigest: digest,
            result,
            changeSequence: nextSeq,
            createdAt: deletedTimestamp,
          })

          return {
            ok: true,
            data: result,
            changeSequence: nextSeq,
          }
        },
      )
    } catch (error: any) {
      if (error?.name === "QuotaExceededError") {
        return {
          ok: false,
          error: { code: "QUOTA_EXCEEDED", retryable: false, message: error.message },
        }
      }
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async get(id: string, includeDeleted = false): Promise<DictionaryReply<LocalDictionaryRecord>> {
    try {
      const record = await this.db.vocabularies.get(id)
      if (!record || (!includeDeleted && record.deletedAt)) {
        return {
          ok: false,
          error: { code: "NOT_FOUND", retryable: false, message: "Record not found" },
        }
      }

      const seqRecord = await this.db.metadata.get("changeSequence")
      const changeSequence = (seqRecord?.value as number) || 0

      return {
        ok: true,
        data: record,
        changeSequence,
      }
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async list(input: ListInput = {}): Promise<DictionaryReply<ListOutput>> {
    try {
      const page = Math.max(1, input.page || 1)
      const pageSize = Math.min(100, Math.max(1, input.pageSize || 20))

      const allRecords = await this.db.vocabularies
        .filter((record) => (input.deletedOnly ? Boolean(record.deletedAt) : !record.deletedAt))
        .toArray()

      let filtered = allRecords
      if (input.actionId) {
        filtered = filtered.filter((r) => r.actionId === input.actionId)
      }

      if (input.search?.trim()) {
        const query = input.search.trim().toLowerCase()
        filtered = filtered.filter((r) => {
          for (const val of Object.values(r.cells)) {
            if (val !== null && String(val).toLowerCase().includes(query)) {
              return true
            }
          }
          return false
        })
      }

      // Sort descending by updatedAt, then id
      filtered.sort((a, b) => {
        if (b.updatedAt !== a.updatedAt) {
          return b.updatedAt - a.updatedAt
        }
        return a.id.localeCompare(b.id)
      })

      const total = filtered.length
      const offset = (page - 1) * pageSize
      const records = filtered.slice(offset, offset + pageSize)

      const seqRecord = await this.db.metadata.get("changeSequence")
      const changeSequence = (seqRecord?.value as number) || 0

      return {
        ok: true,
        data: {
          records,
          total,
          page,
          pageSize,
        },
        changeSequence,
      }
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async getMutationResult(requestId: string): Promise<DictionaryReply<unknown>> {
    try {
      const receipt = await this.db.mutationReceipts.get(requestId)
      if (!receipt) {
        return {
          ok: false,
          error: { code: "NOT_FOUND", retryable: false, message: "Receipt not found" },
        }
      }
      return {
        ok: true,
        data: receipt.result,
        changeSequence: receipt.changeSequence,
      }
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async listConflictVersions(id: string): Promise<DictionaryReply<PortableDictionaryRecord[]>> {
    try {
      const list = await this.db.conflictVersions.where("id").equals(id).toArray()
      list.sort((a, b) => {
        if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
        return a.deviceId > b.deviceId ? -1 : a.deviceId < b.deviceId ? 1 : 0
      })
      const seq = await this.db.metadata.get("changeSequence")
      return {
        ok: true,
        data: list,
        changeSequence: (seq?.value as number) || 0,
      }
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async restoreConflictVersionAsNew(
    input: RestoreConflictVersionInput,
  ): Promise<DictionaryReply<LocalDictionaryRecord>> {
    const digest = computeRequestDigest(input)
    const existingReceipt = await this.db.mutationReceipts.get(input.requestId)
    if (existingReceipt) {
      if (existingReceipt.requestDigest !== digest) {
        return {
          ok: false,
          error: {
            code: "REQUEST_ID_REUSED",
            retryable: false,
            message: "Request ID already used with different payload",
          },
        }
      }
      return {
        ok: true,
        data: existingReceipt.result as LocalDictionaryRecord,
        changeSequence: existingReceipt.changeSequence,
      }
    }

    try {
      return await this.db.transaction(
        "rw",
        [
          this.db.vocabularies,
          this.db.conflictVersions,
          this.db.metadata,
          this.db.syncChanges,
          this.db.mutationReceipts,
        ],
        async () => {
          const conflicts = await this.db.conflictVersions
            .where("id")
            .equals(input.versionId.id)
            .toArray()
          let source = conflicts.find(
            (c) =>
              c.updatedAt === input.versionId.updatedAt && c.deviceId === input.versionId.deviceId,
          )
          if (!source) {
            const vocab = await this.db.vocabularies.get(input.versionId.id)
            if (
              vocab &&
              vocab.updatedAt === input.versionId.updatedAt &&
              vocab.deviceId === input.versionId.deviceId
            ) {
              source = toPortableRecord(vocab)
            }
          }

          if (!source) {
            return {
              ok: false,
              error: {
                code: "NOT_FOUND",
                retryable: false,
                message: "Specified conflict version not found",
              },
            }
          }

          const newId = input.targetId || getRandomUUID()
          const now = Date.now()
          const metadata = await this.getOrInitMetadataWithinTx()
          const newSequence = metadata.changeSequence + 1
          const localRevision = `${now}#${metadata.deviceId}#${newSequence}`

          const newRecord: LocalDictionaryRecord = {
            id: newId,
            createdAt: now,
            updatedAt: now,
            deviceId: metadata.deviceId,
            localRevision,
            actionId: source.actionId,
            actionName: source.actionName,
            outputSchema: source.outputSchema,
            result: source.result,
            columns: source.columns,
            mappings: source.mappings,
            cells: { ...source.cells },
          }

          await this.db.vocabularies.put(newRecord)
          await this.db.metadata.put({ key: "changeSequence", value: newSequence })
          await this.db.syncChanges.add({
            sequence: newSequence,
            entityId: newId,
            entityType: "vocabulary",
            operation: "create",
            timestamp: now,
            deviceId: metadata.deviceId,
            version: { id: newId, updatedAt: now, deviceId: metadata.deviceId },
          })
          await this.db.mutationReceipts.put({
            requestId: input.requestId,
            requestDigest: digest,
            result: newRecord,
            changeSequence: newSequence,
            createdAt: now,
          })

          return {
            ok: true,
            data: newRecord,
            changeSequence: newSequence,
          }
        },
      )
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async restoreDeleted(
    input: RestoreDeletedInput,
  ): Promise<DictionaryReply<LocalDictionaryRecord>> {
    const digest = computeRequestDigest(input)
    const existingReceipt = await this.db.mutationReceipts.get(input.requestId)
    if (existingReceipt) {
      if (existingReceipt.requestDigest !== digest) {
        return {
          ok: false,
          error: {
            code: "REQUEST_ID_REUSED",
            retryable: false,
            message: "Request ID already used with different payload",
          },
        }
      }
      return {
        ok: true,
        data: existingReceipt.result as LocalDictionaryRecord,
        changeSequence: existingReceipt.changeSequence,
      }
    }

    try {
      return await this.db.transaction(
        "rw",
        [
          this.db.vocabularies,
          this.db.conflictVersions,
          this.db.metadata,
          this.db.syncChanges,
          this.db.mutationReceipts,
        ],
        async () => {
          const existing = await this.db.vocabularies.get(input.id)
          if (!existing) {
            return {
              ok: false,
              error: { code: "NOT_FOUND", retryable: false, message: "Record not found" },
            }
          }

          if (!existing.deletedAt) {
            return {
              ok: true,
              data: existing,
              changeSequence: (await this.db.metadata.get("changeSequence"))?.value as number,
            }
          }

          const now = Math.max(Date.now(), existing.updatedAt + 1)
          const metadata = await this.getOrInitMetadataWithinTx()
          const newSequence = metadata.changeSequence + 1
          const localRevision = `${now}#${metadata.deviceId}#${newSequence}`

          const restoredRecord: LocalDictionaryRecord = {
            ...existing,
            updatedAt: now,
            deviceId: metadata.deviceId,
            localRevision,
          }
          delete (restoredRecord as any).deletedAt

          await this.db.vocabularies.put(restoredRecord)
          await this.db.metadata.put({ key: "changeSequence", value: newSequence })
          await this.db.syncChanges.add({
            entityId: existing.id,
            entityType: "vocabulary",
            operation: "update",
            timestamp: now,
            deviceId: metadata.deviceId,
            version: { id: existing.id, updatedAt: now, deviceId: metadata.deviceId },
          })
          await this.db.mutationReceipts.put({
            requestId: input.requestId,
            requestDigest: digest,
            result: restoredRecord,
            changeSequence: newSequence,
            createdAt: now,
          })

          return {
            ok: true,
            data: restoredRecord,
            changeSequence: newSequence,
          }
        },
      )
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error during restore",
        },
      }
    }
  }

  async purge(input: PurgeInput): Promise<DictionaryReply<{ id: string; purged: boolean }>> {
    const digest = computeRequestDigest(input)
    const existingReceipt = await this.db.mutationReceipts.get(input.requestId)
    if (existingReceipt) {
      if (existingReceipt.requestDigest !== digest) {
        return {
          ok: false,
          error: {
            code: "REQUEST_ID_REUSED",
            retryable: false,
            message: "Request ID already used with different payload",
          },
        }
      }
      return {
        ok: true,
        data: existingReceipt.result as { id: string; purged: boolean },
        changeSequence: existingReceipt.changeSequence,
      }
    }

    try {
      return await this.db.transaction(
        "rw",
        [
          this.db.vocabularies,
          this.db.conflictVersions,
          this.db.metadata,
          this.db.syncChanges,
          this.db.mutationReceipts,
        ],
        async () => {
          await this.db.vocabularies.delete(input.id)
          await this.db.conflictVersions.where("id").equals(input.id).delete()

          const metadata = await this.getOrInitMetadataWithinTx()
          const newSequence = metadata.changeSequence + 1
          const now = Date.now()

          await this.db.metadata.put({ key: "changeSequence", value: newSequence })
          await this.db.syncChanges.add({
            entityId: input.id,
            entityType: "vocabulary",
            operation: "delete",
            timestamp: now,
            deviceId: metadata.deviceId,
            version: { id: input.id, updatedAt: now, deviceId: metadata.deviceId },
          })

          const result = { id: input.id, purged: true }
          await this.db.mutationReceipts.put({
            requestId: input.requestId,
            requestDigest: digest,
            result,
            changeSequence: newSequence,
            createdAt: now,
          })

          return {
            ok: true,
            data: result,
            changeSequence: newSequence,
          }
        },
      )
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error during purge",
        },
      }
    }
  }

  async purgeAllDeleted(): Promise<DictionaryReply<{ purgedCount: number }>> {
    try {
      return await this.db.transaction(
        "rw",
        [this.db.vocabularies, this.db.conflictVersions, this.db.metadata, this.db.syncChanges],
        async () => {
          const deleted = await this.db.vocabularies.filter((r) => Boolean(r.deletedAt)).toArray()
          const metadata = await this.getOrInitMetadataWithinTx()
          let currentSeq = metadata.changeSequence
          const now = Date.now()

          for (const item of deleted) {
            await this.db.vocabularies.delete(item.id)
            await this.db.conflictVersions.where("id").equals(item.id).delete()
            currentSeq++
            await this.db.syncChanges.add({
              entityId: item.id,
              entityType: "vocabulary",
              operation: "delete",
              timestamp: now,
              deviceId: metadata.deviceId,
              version: { id: item.id, updatedAt: now, deviceId: metadata.deviceId },
            })
          }

          if (deleted.length > 0) {
            await this.db.metadata.put({ key: "changeSequence", value: currentSeq })
          }

          return {
            ok: true,
            data: { purgedCount: deleted.length },
            changeSequence: currentSeq,
          }
        },
      )
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error during purgeAllDeleted",
        },
      }
    }
  }

  async exportSnapshot(): Promise<DictionaryReply<string>> {
    try {
      return await this.db.transaction(
        "r",
        [this.db.vocabularies, this.db.conflictVersions, this.db.metadata],
        async () => {
          const records = await this.db.vocabularies.toArray()
          const conflicts = await this.db.conflictVersions.toArray()
          const jsonStr = exportDictionarySnapshot(records, conflicts)
          const seq = await this.db.metadata.get("changeSequence")
          return {
            ok: true,
            data: jsonStr,
            changeSequence: (seq?.value as number) || 0,
          }
        },
      )
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async previewImport(
    snapshot: DictionarySnapshotV1,
  ): Promise<DictionaryReply<ImportPreviewResult>> {
    try {
      const envelopeErrors: string[] = []
      if (snapshot.format !== "readfrog-local") envelopeErrors.push("Invalid format")
      if (snapshot.version !== 1) envelopeErrors.push("Unsupported version")
      if (envelopeErrors.length > 0) {
        return {
          ok: true,
          data: {
            addedCount: 0,
            updatedCount: 0,
            deletedCount: 0,
            preservedCount: 0,
            unchangedCount: 0,
            addedConflictCount: 0,
            expectedSequence: 0,
            snapshotHash: "",
            errors: envelopeErrors,
          },
          changeSequence: 0,
        }
      }

      const snapshotHash = sha256(canonicalStringify(snapshot))
      const involvedIds = new Set<string>()
      for (const v of snapshot.vocabularies) involvedIds.add(v.id)
      for (const c of snapshot.conflictVersions) involvedIds.add(c.id)

      const idList = Array.from(involvedIds)

      return await this.db.transaction(
        "r",
        [this.db.vocabularies, this.db.conflictVersions, this.db.metadata],
        async () => {
          const seqRecord = await this.db.metadata.get("changeSequence")
          const currentSequence = (seqRecord?.value as number) || 0

          const localRecords: PortableDictionaryRecord[] = []
          const localConflicts: PortableDictionaryRecord[] = []

          for (const id of idList) {
            const localV = await this.db.vocabularies.get(id)
            if (localV) localRecords.push(toPortableRecord(localV))
            const cList = await this.db.conflictVersions.where("id").equals(id).toArray()
            for (const c of cList) localConflicts.push(toPortableRecord(c))
          }

          let reconciled: ReturnType<typeof reconcileRecordSets>
          try {
            reconciled = reconcileRecordSets(
              localRecords,
              localConflicts,
              snapshot.vocabularies,
              snapshot.conflictVersions,
            )
          } catch (err: any) {
            return {
              ok: true,
              data: {
                addedCount: 0,
                updatedCount: 0,
                deletedCount: 0,
                preservedCount: 0,
                unchangedCount: 0,
                addedConflictCount: 0,
                expectedSequence: currentSequence,
                snapshotHash,
                errors: [err?.message ?? "Reconciliation validation failed"],
              },
              changeSequence: currentSequence,
            }
          }

          const localMap = new Map<string, PortableDictionaryRecord>(
            localRecords.map((r) => [r.id, r]),
          )
          const localConflictMap = new Map<string, Set<string>>()
          for (const c of localConflicts) {
            const set = localConflictMap.get(c.id) ?? new Set()
            set.add(getVersionIdentityKey(c))
            localConflictMap.set(c.id, set)
          }

          let addedCount = 0
          let updatedCount = 0
          let deletedCount = 0
          let preservedCount = 0
          let unchangedCount = 0
          let addedConflictCount = 0

          for (const [id, winner] of reconciled.winners.entries()) {
            const local = localMap.get(id)
            const existingConflictKeys = localConflictMap.get(id) ?? new Set()
            const mergedConflicts = reconciled.conflictsByRecordId.get(id) ?? []
            const newConflicts = mergedConflicts.filter(
              (c) => !existingConflictKeys.has(getVersionIdentityKey(c)),
            )
            addedConflictCount += newConflicts.length

            if (!local) {
              if (winner.deletedAt !== undefined && winner.deletedAt !== null) {
                deletedCount++
              } else {
                addedCount++
              }
            } else {
              const winnerKey = getVersionIdentityKey(winner)
              const localKey = getVersionIdentityKey(local)
              if (winnerKey !== localKey) {
                if (winner.deletedAt !== undefined && winner.deletedAt !== null) {
                  deletedCount++
                } else {
                  updatedCount++
                }
              } else {
                if (newConflicts.length > 0) {
                  preservedCount++
                } else {
                  unchangedCount++
                }
              }
            }
          }

          return {
            ok: true,
            data: {
              addedCount,
              updatedCount,
              deletedCount,
              preservedCount,
              unchangedCount,
              addedConflictCount,
              expectedSequence: currentSequence,
              snapshotHash,
              errors: [],
            },
            changeSequence: currentSequence,
          }
        },
      )
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async commitImport(input: CommitImportInput): Promise<DictionaryReply<CommitImportOutput>> {
    const digest = computeRequestDigest(input)
    const existingReceipt = await this.db.mutationReceipts.get(input.requestId)
    if (existingReceipt) {
      if (existingReceipt.requestDigest !== digest) {
        return {
          ok: false,
          error: {
            code: "REQUEST_ID_REUSED",
            retryable: false,
            message: "Request ID already used with different payload",
          },
        }
      }
      return {
        ok: true,
        data: existingReceipt.result as CommitImportOutput,
        changeSequence: existingReceipt.changeSequence,
      }
    }

    try {
      return await this.db.transaction(
        "rw",
        [
          this.db.vocabularies,
          this.db.conflictVersions,
          this.db.metadata,
          this.db.syncChanges,
          this.db.mutationReceipts,
        ],
        async () => {
          const seqRecord = await this.db.metadata.get("changeSequence")
          const currentSequence = (seqRecord?.value as number) || 0
          if (currentSequence !== input.expectedSequence) {
            return {
              ok: false,
              error: {
                code: "EDIT_CONFLICT",
                retryable: true,
                message: `Database change sequence changed (expected ${input.expectedSequence}, currently ${currentSequence}). Please re-preview before importing.`,
              },
            }
          }

          const involvedIds = new Set<string>()
          for (const v of input.snapshot.vocabularies) involvedIds.add(v.id)
          for (const c of input.snapshot.conflictVersions) involvedIds.add(c.id)
          const idList = Array.from(involvedIds)

          const localRecords: PortableDictionaryRecord[] = []
          const localConflicts: PortableDictionaryRecord[] = []

          for (const id of idList) {
            const localV = await this.db.vocabularies.get(id)
            if (localV) localRecords.push(toPortableRecord(localV))
            const cList = await this.db.conflictVersions.where("id").equals(id).toArray()
            for (const c of cList) localConflicts.push(toPortableRecord(c))
          }

          const reconciled = reconcileRecordSets(
            localRecords,
            localConflicts,
            input.snapshot.vocabularies,
            input.snapshot.conflictVersions,
          )

          const localMap = new Map<string, LocalDictionaryRecord>()
          for (const id of idList) {
            const localV = await this.db.vocabularies.get(id)
            if (localV) localMap.set(id, localV)
          }

          const localConflictMap = new Map<string, Set<string>>()
          for (const c of localConflicts) {
            const set = localConflictMap.get(c.id) ?? new Set()
            set.add(getVersionIdentityKey(c))
            localConflictMap.set(c.id, set)
          }

          let addedCount = 0
          let updatedCount = 0
          let deletedCount = 0
          let preservedCount = 0
          let addedConflictCount = 0

          let runningSequence = currentSequence
          const metadata = await this.getOrInitMetadataWithinTx()
          const now = Date.now()

          for (const [id, winner] of reconciled.winners.entries()) {
            const local = localMap.get(id)
            const existingConflictKeys = localConflictMap.get(id) ?? new Set()
            const mergedConflicts = reconciled.conflictsByRecordId.get(id) ?? []
            const newConflicts = mergedConflicts.filter(
              (c) => !existingConflictKeys.has(getVersionIdentityKey(c)),
            )
            addedConflictCount += newConflicts.length

            for (const c of newConflicts) {
              await this.db.conflictVersions.put(c)
            }

            const winnerKey = getVersionIdentityKey(winner)
            const localKey = local ? getVersionIdentityKey(local) : null

            if (!local) {
              runningSequence++
              const localRevision = `${now}#${metadata.deviceId}#${runningSequence}`
              await this.db.vocabularies.put({ ...winner, localRevision })
              await this.db.syncChanges.add({
                sequence: runningSequence,
                entityId: id,
                entityType: "vocabulary",
                operation: winner.deletedAt ? "delete" : "create",
                timestamp: now,
                deviceId: metadata.deviceId,
                version: { id, updatedAt: winner.updatedAt, deviceId: winner.deviceId },
              })
              if (winner.deletedAt) deletedCount++
              else addedCount++
            } else if (winnerKey !== localKey) {
              runningSequence++
              const localRevision = `${now}#${metadata.deviceId}#${runningSequence}`
              await this.db.vocabularies.put({ ...winner, localRevision })
              await this.db.syncChanges.add({
                sequence: runningSequence,
                entityId: id,
                entityType: "vocabulary",
                operation: winner.deletedAt ? "delete" : "update",
                timestamp: now,
                deviceId: metadata.deviceId,
                version: { id, updatedAt: winner.updatedAt, deviceId: winner.deviceId },
              })
              if (winner.deletedAt) deletedCount++
              else updatedCount++
            } else if (newConflicts.length > 0) {
              runningSequence++
              await this.db.syncChanges.add({
                sequence: runningSequence,
                entityId: id,
                entityType: "vocabulary",
                operation: "update",
                timestamp: now,
                deviceId: metadata.deviceId,
                version: { id, updatedAt: winner.updatedAt, deviceId: winner.deviceId },
              })
              preservedCount++
            }
          }

          await this.db.metadata.put({ key: "changeSequence", value: runningSequence })

          const output: CommitImportOutput = {
            addedCount,
            updatedCount,
            deletedCount,
            preservedCount,
            addedConflictCount,
          }

          await this.db.mutationReceipts.put({
            requestId: input.requestId,
            requestDigest: digest,
            result: output,
            changeSequence: runningSequence,
            createdAt: now,
          })

          return {
            ok: true,
            data: output,
            changeSequence: runningSequence,
          }
        },
      )
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error",
        },
      }
    }
  }

  async applySyncMerge(
    remoteSnapshot: DictionarySnapshotV1,
  ): Promise<DictionaryReply<ApplySyncMergeResult>> {
    try {
      return await this.db.transaction(
        "rw",
        [this.db.vocabularies, this.db.conflictVersions, this.db.metadata, this.db.syncChanges],
        async () => {
          const metadata = await this.getOrInitMetadataWithinTx()
          let runningSequence = metadata.changeSequence
          const now = Date.now()

          // 1. Read all local vocabularies and conflicts
          const localVocabs = await this.db.vocabularies.toArray()
          const localConflicts = await this.db.conflictVersions.toArray()
          const localPortable = localVocabs.map(toPortableRecord)
          const localConflictsPortable = localConflicts.map(toPortableRecord)

          // 2. Reconcile local and remote record sets
          let reconciled: ReturnType<typeof reconcileRecordSets>
          try {
            reconciled = reconcileRecordSets(
              localPortable,
              localConflictsPortable,
              remoteSnapshot.vocabularies,
              remoteSnapshot.conflictVersions,
            )
          } catch (err: any) {
            return {
              ok: false,
              error: {
                code: "INVALID_DATA",
                retryable: false,
                message: err?.message ?? "Reconciliation integrity error",
              },
            }
          }

          const localMap = new Map<string, LocalDictionaryRecord>()
          for (const v of localVocabs) {
            localMap.set(v.id, v)
          }

          const localConflictMap = new Map<string, Set<string>>()
          for (const c of localConflicts) {
            const set = localConflictMap.get(c.id) ?? new Set()
            set.add(getVersionIdentityKey(c))
            localConflictMap.set(c.id, set)
          }

          let addedCount = 0
          let updatedCount = 0
          let deletedCount = 0
          let preservedCount = 0
          let addedConflictCount = 0
          let localUpdated = false

          for (const [id, winner] of reconciled.winners.entries()) {
            const local = localMap.get(id)
            const existingConflictKeys = localConflictMap.get(id) ?? new Set()
            const mergedConflicts = reconciled.conflictsByRecordId.get(id) ?? []
            const newConflicts = mergedConflicts.filter(
              (c) => !existingConflictKeys.has(getVersionIdentityKey(c)),
            )

            if (newConflicts.length > 0) {
              for (const c of newConflicts) {
                await this.db.conflictVersions.put(c)
              }
              addedConflictCount += newConflicts.length
              localUpdated = true
            }

            const winnerKey = getVersionIdentityKey(winner)
            const localKey = local ? getVersionIdentityKey(local) : null

            if (!local) {
              runningSequence++
              const localRevision = `${now}#${metadata.deviceId}#${runningSequence}`
              await this.db.vocabularies.put({ ...winner, localRevision })
              await this.db.syncChanges.add({
                sequence: runningSequence,
                entityId: id,
                entityType: "vocabulary",
                operation: winner.deletedAt ? "delete" : "create",
                timestamp: now,
                deviceId: metadata.deviceId,
                version: { id, updatedAt: winner.updatedAt, deviceId: winner.deviceId },
              })
              if (winner.deletedAt) deletedCount++
              else addedCount++
              localUpdated = true
            } else if (winnerKey !== localKey) {
              runningSequence++
              const localRevision = `${now}#${metadata.deviceId}#${runningSequence}`
              await this.db.vocabularies.put({ ...winner, localRevision })
              await this.db.syncChanges.add({
                sequence: runningSequence,
                entityId: id,
                entityType: "vocabulary",
                operation: winner.deletedAt ? "delete" : "update",
                timestamp: now,
                deviceId: metadata.deviceId,
                version: { id, updatedAt: winner.updatedAt, deviceId: winner.deviceId },
              })
              if (winner.deletedAt) deletedCount++
              else updatedCount++
              localUpdated = true
            } else if (newConflicts.length > 0) {
              runningSequence++
              await this.db.syncChanges.add({
                sequence: runningSequence,
                entityId: id,
                entityType: "vocabulary",
                operation: "update",
                timestamp: now,
                deviceId: metadata.deviceId,
                version: { id, updatedAt: winner.updatedAt, deviceId: winner.deviceId },
              })
              preservedCount++
              localUpdated = true
            }
          }

          if (localUpdated) {
            await this.db.metadata.put({ key: "changeSequence", value: runningSequence })
          }

          // Construct canonical mergedSnapshot
          const mergedVocabularies: PortableDictionaryRecord[] = Array.from(
            reconciled.winners.values(),
          ).map(toPortableRecord)
          mergedVocabularies.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

          const allMergedConflicts: PortableDictionaryRecord[] = []
          for (const list of reconciled.conflictsByRecordId.values()) {
            allMergedConflicts.push(...list.map(toPortableRecord))
          }
          allMergedConflicts.sort((a, b) => {
            if (a.id !== b.id) return a.id < b.id ? -1 : 1
            return compareRecordVersions(a, b)
          })

          const mergedSnapshot: DictionarySnapshotV1 = {
            format: "readfrog-local",
            version: 1,
            updatedAt: Math.max(Date.now(), remoteSnapshot.updatedAt || 0),
            vocabularies: mergedVocabularies,
            conflictVersions: allMergedConflicts,
          }

          // Check if remote upload is needed
          const remoteVocabCanon = canonicalStringify(remoteSnapshot.vocabularies || [])
          const mergedVocabCanon = canonicalStringify(mergedVocabularies)
          const remoteConflictsCanon = canonicalStringify(remoteSnapshot.conflictVersions || [])
          const mergedConflictsCanon = canonicalStringify(allMergedConflicts)

          const needsRemoteUpload =
            remoteVocabCanon !== mergedVocabCanon || remoteConflictsCanon !== mergedConflictsCanon

          return {
            ok: true,
            data: {
              localUpdated,
              addedCount,
              updatedCount,
              deletedCount,
              preservedCount,
              addedConflictCount,
              mergedSnapshot,
              needsRemoteUpload,
            },
            changeSequence: runningSequence,
          }
        },
      )
    } catch (error: any) {
      if (error?.name === "QuotaExceededError") {
        return {
          ok: false,
          error: { code: "QUOTA_EXCEEDED", retryable: false, message: error.message },
        }
      }
      return {
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          message: error?.message ?? "Storage error during sync merge",
        },
      }
    }
  }

  async getPendingSyncChangesCount(): Promise<number> {
    try {
      return await this.db.syncChanges.count()
    } catch {
      return 0
    }
  }
}
