import type { LocalDictionaryRecord, PortableDictionaryRecord } from "../types"
import { describe, expect, it } from "vitest"
import {
  exportDictionarySnapshot,
  parseAndValidateSnapshot,
  SNAPSHOT_MAX_SIZE_BYTES,
} from "../snapshot"

function createLocalRecord(overrides: Partial<LocalDictionaryRecord> = {}): LocalDictionaryRecord {
  return {
    id: "vocab-b",
    createdAt: 1000,
    updatedAt: 2000,
    deviceId: "device-test",
    localRevision: "1000#device-test#1",
    actionId: "default-dictionary",
    actionName: "Dictionary",
    outputSchema: [
      { id: "field-1", name: "word", type: "string", description: "", speaking: false },
    ],
    result: { word: "banana" },
    columns: [{ id: "col-1", name: "Word", position: 0 }],
    mappings: [
      {
        id: "map-1",
        localFieldId: "field-1",
        notebaseColumnId: "col-1",
        notebaseColumnNameSnapshot: "Word",
      },
    ],
    cells: { "col-1": "banana" },
    ...overrides,
  }
}

function createPortableRecord(
  overrides: Partial<PortableDictionaryRecord> = {},
): PortableDictionaryRecord {
  const { localRevision: _localRevision, ...rest } = createLocalRecord(overrides)
  return rest
}

describe("Snapshot: Export", () => {
  it("exports pure snapshot with deterministic ordering and strips localRevision", () => {
    const vocabA = createLocalRecord({ id: "vocab-z", updatedAt: 2000 })
    const vocabB = createLocalRecord({ id: "vocab-a", updatedAt: 1500 })
    const conflict1 = createPortableRecord({ id: "vocab-z", updatedAt: 1000, deviceId: "dev-2" })
    const conflict2 = createPortableRecord({ id: "vocab-z", updatedAt: 1000, deviceId: "dev-1" })

    const jsonStr = exportDictionarySnapshot([vocabA, vocabB], [conflict1, conflict2])
    const parsed = JSON.parse(jsonStr)

    expect(parsed.format).toBe("readfrog-local")
    expect(parsed.version).toBe(1)
    expect(typeof parsed.updatedAt).toBe("number")

    // Vocabularies sorted by id
    expect(parsed.vocabularies.map((v: any) => v.id)).toEqual(["vocab-a", "vocab-z"])
    // localRevision must be stripped
    expect(parsed.vocabularies[0].localRevision).toBeUndefined()
    expect(parsed.vocabularies[1].localRevision).toBeUndefined()

    // ConflictVersions sorted by id, then updatedAt, then deviceId
    expect(parsed.conflictVersions.map((c: any) => c.deviceId)).toEqual(["dev-1", "dev-2"])

    // Deterministic formatting (two-space indentation, trailing newline)
    expect(jsonStr.endsWith("\n")).toBe(true)
  })
})

describe("Snapshot: Parse and Validation", () => {
  it("accepts valid snapshot", () => {
    const record = createPortableRecord({ id: "rec-1" })
    const validJson = exportDictionarySnapshot([record], [])
    const result = parseAndValidateSnapshot(validJson)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.vocabularies.length).toBe(1)
    expect(result.snapshot.conflictVersions.length).toBe(0)
  })

  it("rejects non-json string", () => {
    const result = parseAndValidateSnapshot("not a json string")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("Invalid JSON")
  })

  it("rejects missing envelope or wrong format/version", () => {
    const invalidFormat = JSON.stringify({
      format: "other-format",
      version: 1,
      vocabularies: [],
      conflictVersions: [],
    })
    const res1 = parseAndValidateSnapshot(invalidFormat)
    expect(res1.ok).toBe(false)

    const invalidVersion = JSON.stringify({
      format: "readfrog-local",
      version: 2,
      vocabularies: [],
      conflictVersions: [],
    })
    const res2 = parseAndValidateSnapshot(invalidVersion)
    expect(res2.ok).toBe(false)
    if (res2.ok) return
    expect(res2.error).toContain("Unsupported version")
  })

  it("rejects when size exceeds budget", () => {
    const huge = " ".repeat(SNAPSHOT_MAX_SIZE_BYTES + 10)
    const res = parseAndValidateSnapshot(huge)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain("exceeds size budget")
  })

  it("rejects duplicate IDs within vocabularies or invalid internal references", () => {
    const rec1 = createPortableRecord({ id: "rec-dup" })
    const rec2 = createPortableRecord({ id: "rec-dup" })
    const json = JSON.stringify({
      format: "readfrog-local",
      version: 1,
      updatedAt: Date.now(),
      vocabularies: [rec1, rec2],
      conflictVersions: [],
    })

    const res = parseAndValidateSnapshot(json)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain("Duplicate record id")
  })
})
