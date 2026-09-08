import type { PortableDictionaryRecord } from "./types"

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`
  }

  const record = value as Record<string, unknown>
  const sortedKeys = Object.keys(record).sort()
  const entries = sortedKeys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)

  return `{${entries.join(",")}}`
}

export function isStructurallyEqual(a: unknown, b: unknown): boolean {
  return canonicalStringify(a) === canonicalStringify(b)
}

export function validateRecordIntegrity(record: PortableDictionaryRecord): string[] {
  const errors: string[] = []

  if (!record.id) errors.push("Record id is missing")
  if (
    typeof record.createdAt !== "number" ||
    !Number.isSafeInteger(record.createdAt) ||
    record.createdAt < 0
  ) {
    errors.push("Invalid createdAt timestamp")
  }
  if (
    typeof record.updatedAt !== "number" ||
    !Number.isSafeInteger(record.updatedAt) ||
    record.updatedAt < 0
  ) {
    errors.push("Invalid updatedAt timestamp")
  }
  if (record.createdAt > record.updatedAt) {
    errors.push("createdAt cannot be greater than updatedAt")
  }
  if (record.deletedAt !== undefined && record.deletedAt !== null) {
    if (
      typeof record.deletedAt !== "number" ||
      !Number.isSafeInteger(record.deletedAt) ||
      record.deletedAt < 0
    ) {
      errors.push("Invalid deletedAt timestamp")
    }
  }

  const columnIds = new Set<string>()
  for (const col of record.columns ?? []) {
    if (columnIds.has(col.id)) {
      errors.push(`Duplicate column id: ${col.id}`)
    }
    columnIds.add(col.id)
  }

  const fieldIds = new Set<string>()
  for (const field of record.outputSchema ?? []) {
    if (fieldIds.has(field.id)) {
      errors.push(`Duplicate outputSchema field id: ${field.id}`)
    }
    fieldIds.add(field.id)
  }

  for (const mapping of record.mappings ?? []) {
    if (!fieldIds.has(mapping.localFieldId)) {
      errors.push(
        `Mapping ${mapping.id} references unknown outputSchema field: ${mapping.localFieldId}`,
      )
    }
    if (!columnIds.has(mapping.notebaseColumnId)) {
      errors.push(`Mapping ${mapping.id} references unknown column: ${mapping.notebaseColumnId}`)
    }
  }

  for (const cellKey of Object.keys(record.cells ?? {})) {
    if (!columnIds.has(cellKey)) {
      errors.push(`Cell references undefined column: ${cellKey}`)
    }
  }

  return errors
}

export function assertImmutableDefinitionsMatch(
  a: PortableDictionaryRecord,
  b: PortableDictionaryRecord,
): void {
  if (a.id !== b.id) {
    throw new Error(`Record ID mismatch: ${a.id} vs ${b.id}`)
  }

  if (a.createdAt !== b.createdAt) {
    throw new Error(
      `Record ${a.id} has mismatched immutable createdAt: ${a.createdAt} vs ${b.createdAt}`,
    )
  }
  if (a.actionId !== b.actionId || a.actionName !== b.actionName) {
    throw new Error(
      `Record ${a.id} has mismatched immutable action definition: ${a.actionId} vs ${b.actionId}`,
    )
  }

  if (!isStructurallyEqual(a.outputSchema, b.outputSchema)) {
    throw new Error(`Record ${a.id} has mismatched immutable outputSchema`)
  }
  if (!isStructurallyEqual(a.result, b.result)) {
    throw new Error(`Record ${a.id} has mismatched immutable result`)
  }
  if (!isStructurallyEqual(a.columns, b.columns)) {
    throw new Error(`Record ${a.id} has mismatched immutable columns`)
  }
  if (!isStructurallyEqual(a.mappings, b.mappings)) {
    throw new Error(`Record ${a.id} has mismatched immutable mappings`)
  }
}

export function getVersionIdentityKey(record: PortableDictionaryRecord): string {
  return `${record.id}#${record.updatedAt}#${record.deviceId}`
}

export function compareRecordVersions(
  a: PortableDictionaryRecord,
  b: PortableDictionaryRecord,
): number {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt - b.updatedAt
  }
  if (a.deviceId < b.deviceId) return -1
  if (a.deviceId > b.deviceId) return 1
  return 0
}

export interface ReconciledRecordState {
  winner: PortableDictionaryRecord
  conflictVersions: PortableDictionaryRecord[]
}

export function reconcileRecordPair(
  stateA: ReconciledRecordState,
  stateB: ReconciledRecordState,
): ReconciledRecordState {
  const allCandidates = [
    stateA.winner,
    ...stateA.conflictVersions,
    stateB.winner,
    ...stateB.conflictVersions,
  ]

  return reconcileCandidateVersions(allCandidates)
}

export function reconcileCandidateVersions(
  candidates: PortableDictionaryRecord[],
): ReconciledRecordState {
  if (candidates.length === 0) {
    throw new Error("Cannot reconcile empty candidates")
  }

  const primaryRecord = candidates[0]!

  // 1. Verify integrity of all candidates and immutable consistency against primary
  const versionMap = new Map<string, PortableDictionaryRecord>()

  for (const candidate of candidates) {
    const errs = validateRecordIntegrity(candidate)
    if (errs.length > 0) {
      throw new Error(`Record integrity error for ${candidate.id}: ${errs.join("; ")}`)
    }

    assertImmutableDefinitionsMatch(primaryRecord, candidate)

    const identityKey = getVersionIdentityKey(candidate)
    const existing = versionMap.get(identityKey)
    if (existing) {
      if (!isStructurallyEqual(existing, candidate)) {
        throw new Error(
          `Integrity violation: Identical version identity ${identityKey} with divergent payload. Merging rejected.`,
        )
      }
    } else {
      versionMap.set(identityKey, candidate)
    }
  }

  const uniqueVersions = Array.from(versionMap.values())

  // 2. Filter tombstone candidates if any exists (Tombstone Priority)
  const tombstones = uniqueVersions.filter((v) => v.deletedAt !== undefined && v.deletedAt !== null)
  const poolForWinner = tombstones.length > 0 ? tombstones : uniqueVersions

  // 3. Elect winner based on max updatedAt, then max deviceId (Unicode codepoint order)
  let winner = poolForWinner[0]!
  for (let i = 1; i < poolForWinner.length; i++) {
    const candidate = poolForWinner[i]!
    if (compareRecordVersions(candidate, winner) > 0) {
      winner = candidate
    }
  }

  const winnerIdentity = getVersionIdentityKey(winner)

  // 4. Remaining unique versions go into conflictVersions
  const conflictVersions = uniqueVersions
    .filter((v) => getVersionIdentityKey(v) !== winnerIdentity)
    .sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
      return a.deviceId > b.deviceId ? -1 : a.deviceId < b.deviceId ? 1 : 0
    })

  return {
    winner,
    conflictVersions,
  }
}

export interface ReconciledRecordSetsResult {
  winners: Map<string, PortableDictionaryRecord>
  conflictsByRecordId: Map<string, PortableDictionaryRecord[]>
}

export function reconcileRecordSets(
  localRecords: PortableDictionaryRecord[],
  localConflicts: PortableDictionaryRecord[],
  remoteRecords: PortableDictionaryRecord[],
  remoteConflicts: PortableDictionaryRecord[],
): ReconciledRecordSetsResult {
  const recordsById = new Map<string, PortableDictionaryRecord[]>()

  function addCandidate(rec: PortableDictionaryRecord) {
    const list = recordsById.get(rec.id) ?? []
    list.push(rec)
    recordsById.set(rec.id, list)
  }

  for (const r of localRecords) addCandidate(r)
  for (const r of localConflicts) addCandidate(r)
  for (const r of remoteRecords) addCandidate(r)
  for (const r of remoteConflicts) addCandidate(r)

  const winners = new Map<string, PortableDictionaryRecord>()
  const conflictsByRecordId = new Map<string, PortableDictionaryRecord[]>()

  for (const [id, candidates] of recordsById.entries()) {
    const reconciled = reconcileCandidateVersions(candidates)
    winners.set(id, reconciled.winner)
    if (reconciled.conflictVersions.length > 0) {
      conflictsByRecordId.set(id, reconciled.conflictVersions)
    }
  }

  return {
    winners,
    conflictsByRecordId,
  }
}
