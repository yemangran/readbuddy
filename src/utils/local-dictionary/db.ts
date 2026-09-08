import type { EntityTable } from "dexie"
import type {
  LocalDictionaryRecord,
  MetadataRecord,
  MutationReceiptRecord,
  PortableDictionaryRecord,
  SyncChangeRecord,
} from "./types"
import { Dexie } from "dexie"

export const LOCAL_DICTIONARY_DB_NAME = "readfrog-local"

export class LocalDictionaryDB extends Dexie {
  vocabularies!: EntityTable<LocalDictionaryRecord, "id">
  metadata!: EntityTable<MetadataRecord, "key">
  syncChanges!: EntityTable<SyncChangeRecord, "sequence">
  mutationReceipts!: EntityTable<MutationReceiptRecord, "requestId">
  conflictVersions!: EntityTable<PortableDictionaryRecord, "id">

  constructor(databaseName: string = LOCAL_DICTIONARY_DB_NAME) {
    super(databaseName)
    this.version(1).stores({
      vocabularies: "id, [updatedAt+id], [actionId+updatedAt+id]",
      metadata: "key",
      syncChanges: "++sequence, entityId",
      mutationReceipts: "requestId",
      conflictVersions: "[id+updatedAt+deviceId], id",
    })
  }
}

let dbInstance: LocalDictionaryDB | null = null

export function getLocalDictionaryDb(): LocalDictionaryDB {
  if (!dbInstance) {
    dbInstance = new LocalDictionaryDB()
  }
  return dbInstance
}
