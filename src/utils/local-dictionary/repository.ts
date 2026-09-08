import type {
  CreateManyInput,
  DeleteInput,
  DictionaryReply,
  ListInput,
  ListOutput,
  LocalDictionaryRecord,
  PortableDictionaryRecord,
  UpdateCellsInput,
} from "./types"
import { sha256 } from "js-sha256"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { type LocalDictionaryDB } from "./db"

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

export class LocalDictionaryRepository {
  constructor(private readonly db: LocalDictionaryDB) {}

  async getMetadata(): Promise<{ deviceId: string; changeSequence: number }> {
    return await this.db.transaction("rw", this.db.metadata, async () => {
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
    })
  }

  async createMany(input: CreateManyInput): Promise<DictionaryReply<{ createdIds: string[] }>> {
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

          // 3. Check for existing IDs
          for (const item of input.items) {
            const exists = await this.db.vocabularies.get(item.id)
            if (exists) {
              return {
                ok: false,
                error: {
                  code: "INVALID_DATA",
                  retryable: false,
                  message: `Record with id "${item.id}" already exists`,
                },
              }
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

  async get(id: string): Promise<DictionaryReply<LocalDictionaryRecord>> {
    try {
      const record = await this.db.vocabularies.get(id)
      if (!record || record.deletedAt) {
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

      const allActive = await this.db.vocabularies.filter((record) => !record.deletedAt).toArray()

      let filtered = allActive
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
}
