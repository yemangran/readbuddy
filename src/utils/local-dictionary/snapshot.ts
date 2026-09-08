import type { DictionarySnapshotV1, LocalDictionaryRecord, PortableDictionaryRecord } from "./types"
import { canonicalStringify, compareRecordVersions, validateRecordIntegrity } from "./reconciler"

export const SNAPSHOT_MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

export function toPortableRecord(
  record: LocalDictionaryRecord | PortableDictionaryRecord,
): PortableDictionaryRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deviceId: record.deviceId,
    ...(record.deletedAt !== undefined && record.deletedAt !== null
      ? { deletedAt: record.deletedAt }
      : {}),
    actionId: record.actionId,
    actionName: record.actionName,
    outputSchema: record.outputSchema,
    result: record.result,
    columns: record.columns,
    mappings: record.mappings,
    cells: record.cells,
  }
}

function canonicalSortObject<T>(obj: T): T {
  return JSON.parse(canonicalStringify(obj)) as T
}

export function exportDictionarySnapshot(
  records: (LocalDictionaryRecord | PortableDictionaryRecord)[],
  conflictVersions: PortableDictionaryRecord[],
): string {
  const portableVocabularies = records.map((r) => canonicalSortObject(toPortableRecord(r)))
  portableVocabularies.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const portableConflicts = conflictVersions.map((c) => canonicalSortObject(toPortableRecord(c)))
  portableConflicts.sort((a, b) => {
    if (a.id !== b.id) return a.id < b.id ? -1 : 1
    return compareRecordVersions(a, b)
  })

  const snapshot: DictionarySnapshotV1 = {
    format: "readfrog-local",
    version: 1,
    updatedAt: Date.now(),
    vocabularies: portableVocabularies,
    conflictVersions: portableConflicts,
  }

  return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function parseAndValidateSnapshot(
  jsonString: string,
): { ok: true; snapshot: DictionarySnapshotV1 } | { ok: false; error: string } {
  if (jsonString.length > SNAPSHOT_MAX_SIZE_BYTES) {
    return {
      ok: false,
      error: `Snapshot file size (${jsonString.length} bytes) exceeds size budget of ${SNAPSHOT_MAX_SIZE_BYTES} bytes`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonString)
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${(err as Error).message}` }
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Invalid snapshot envelope: not an object" }
  }

  const envelope = parsed as Record<string, unknown>
  if (envelope.format !== "readfrog-local") {
    return {
      ok: false,
      error: `Invalid snapshot format: expected 'readfrog-local', received '${String(envelope.format)}'`,
    }
  }
  if (envelope.version !== 1) {
    return {
      ok: false,
      error: `Unsupported version: expected 1, received '${String(envelope.version)}'`,
    }
  }
  if (!Array.isArray(envelope.vocabularies)) {
    return { ok: false, error: "Snapshot vocabularies must be an array" }
  }
  if (!Array.isArray(envelope.conflictVersions)) {
    return { ok: false, error: "Snapshot conflictVersions must be an array" }
  }

  const vocabularies: PortableDictionaryRecord[] = []
  const seenVocabIds = new Set<string>()

  for (const item of envelope.vocabularies) {
    const record = toPortableRecord(item as PortableDictionaryRecord)
    if (seenVocabIds.has(record.id)) {
      return { ok: false, error: `Duplicate record id in vocabularies: ${record.id}` }
    }
    seenVocabIds.add(record.id)

    const errors = validateRecordIntegrity(record)
    if (errors.length > 0) {
      return { ok: false, error: `Invalid record ${record.id}: ${errors.join(", ")}` }
    }
    vocabularies.push(record)
  }

  const conflictVersions: PortableDictionaryRecord[] = []
  for (const item of envelope.conflictVersions) {
    const record = toPortableRecord(item as PortableDictionaryRecord)
    const errors = validateRecordIntegrity(record)
    if (errors.length > 0) {
      return { ok: false, error: `Invalid conflict version for ${record.id}: ${errors.join(", ")}` }
    }
    conflictVersions.push(record)
  }

  return {
    ok: true,
    snapshot: {
      format: "readfrog-local",
      version: 1,
      updatedAt: typeof envelope.updatedAt === "number" ? envelope.updatedAt : Date.now(),
      vocabularies,
      conflictVersions,
    },
  }
}
