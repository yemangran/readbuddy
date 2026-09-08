import type { PortableDictionaryRecord } from "../types"
import { describe, expect, it } from "vitest"
import {
  canonicalStringify,
  isStructurallyEqual,
  reconcileRecordPair,
  reconcileRecordSets,
  validateRecordIntegrity,
} from "../reconciler"

function createMockRecord(
  overrides: Partial<PortableDictionaryRecord> = {},
): PortableDictionaryRecord {
  return {
    id: "record-1",
    createdAt: 1000,
    updatedAt: 2000,
    deviceId: "device-a",
    actionId: "default-dictionary",
    actionName: "Dictionary",
    outputSchema: [
      { id: "field-1", name: "word", type: "string", description: "", speaking: false },
    ],
    result: { word: "hello" },
    columns: [{ id: "col-1", name: "Word", position: 0 }],
    mappings: [
      {
        id: "map-1",
        localFieldId: "field-1",
        notebaseColumnId: "col-1",
        notebaseColumnNameSnapshot: "Word",
      },
    ],
    cells: { "col-1": "hello" },
    ...overrides,
  }
}

describe("Reconciler: Canonical Structural Equality & Validation", () => {
  it("determines structural equality ignoring key order", () => {
    const a = { b: 1, a: 2, c: { y: "test", x: 10 } }
    const b = { a: 2, c: { x: 10, y: "test" }, b: 1 }
    expect(canonicalStringify(a)).toBe(canonicalStringify(b))
    expect(isStructurallyEqual(a, b)).toBe(true)

    const c = { a: 2, c: { x: 10, y: "diff" }, b: 1 }
    expect(isStructurallyEqual(a, c)).toBe(false)
  })

  it("rejects invalid reference integrity (mappings to unknown column)", () => {
    const record = createMockRecord({
      mappings: [
        {
          id: "m-1",
          localFieldId: "field-1",
          notebaseColumnId: "unknown-col",
          notebaseColumnNameSnapshot: "Unknown",
        },
      ],
    })
    const errors = validateRecordIntegrity(record)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain("references unknown column")
  })

  it("rejects cells referencing undefined columns", () => {
    const record = createMockRecord({
      cells: { "col-1": "valid", "non-existent-col": "invalid" },
    })
    const errors = validateRecordIntegrity(record)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain("undefined column")
  })
})

describe("Reconciler: Unified Record Reconciliation", () => {
  it("applies Tombstone Priority: tombstone wins over newer edit", () => {
    const activeVersion = createMockRecord({
      updatedAt: 5000,
      deviceId: "device-b",
      cells: { "col-1": "newer edit" },
    })
    const tombstoneVersion = createMockRecord({
      updatedAt: 3000,
      deviceId: "device-a",
      deletedAt: 3000,
    })

    const result = reconcileRecordPair(
      { winner: activeVersion, conflictVersions: [] },
      { winner: tombstoneVersion, conflictVersions: [] },
    )

    // Tombstone must win as main record
    expect(result.winner.deletedAt).toBe(3000)
    expect(result.winner.updatedAt).toBe(3000)
    // The active version must be preserved in conflictVersions
    expect(result.conflictVersions.length).toBe(1)
    expect(result.conflictVersions[0]?.updatedAt).toBe(5000)
    expect(result.conflictVersions[0]?.deviceId).toBe("device-b")
  })

  it("selects winner by deviceId code-point order when updatedAt is equal", () => {
    const versionA = createMockRecord({
      updatedAt: 3000,
      deviceId: "device-a",
      cells: { "col-1": "version A" },
    })
    const versionB = createMockRecord({
      updatedAt: 3000,
      deviceId: "device-z",
      cells: { "col-1": "version B" },
    })

    const result = reconcileRecordPair(
      { winner: versionA, conflictVersions: [] },
      { winner: versionB, conflictVersions: [] },
    )

    // device-z > device-a in Unicode code point order
    expect(result.winner.deviceId).toBe("device-z")
    expect(result.conflictVersions.length).toBe(1)
    expect(result.conflictVersions[0]?.deviceId).toBe("device-a")
  })

  it("satisfies Idempotence (A ∪ A = A)", () => {
    const stateA = {
      winner: createMockRecord({ updatedAt: 2000, deviceId: "dev-1" }),
      conflictVersions: [createMockRecord({ updatedAt: 1500, deviceId: "dev-0" })],
    }

    const merged = reconcileRecordPair(stateA, stateA)
    expect(canonicalStringify(merged.winner)).toBe(canonicalStringify(stateA.winner))
    expect(merged.conflictVersions.length).toBe(1)
    expect(canonicalStringify(merged.conflictVersions[0])).toBe(
      canonicalStringify(stateA.conflictVersions[0]),
    )
  })

  it("satisfies Commutativity (A ∪ B = B ∪ A)", () => {
    const stateA = {
      winner: createMockRecord({ updatedAt: 3000, deviceId: "dev-a" }),
      conflictVersions: [createMockRecord({ updatedAt: 1000, deviceId: "dev-old" })],
    }
    const stateB = {
      winner: createMockRecord({ updatedAt: 4000, deviceId: "dev-b" }),
      conflictVersions: [],
    }

    const mergedAB = reconcileRecordPair(stateA, stateB)
    const mergedBA = reconcileRecordPair(stateB, stateA)

    expect(canonicalStringify(mergedAB.winner)).toBe(canonicalStringify(mergedBA.winner))
    expect(mergedAB.conflictVersions.length).toBe(mergedBA.conflictVersions.length)
    expect(canonicalStringify(mergedAB.conflictVersions[0])).toBe(
      canonicalStringify(mergedBA.conflictVersions[0]),
    )
  })

  it("satisfies Associativity ((A ∪ B) ∪ C = A ∪ (B ∪ C))", () => {
    const stateA = {
      winner: createMockRecord({ updatedAt: 2000, deviceId: "dev-1" }),
      conflictVersions: [],
    }
    const stateB = {
      winner: createMockRecord({ updatedAt: 3000, deviceId: "dev-2" }),
      conflictVersions: [],
    }
    const stateC = {
      winner: createMockRecord({ updatedAt: 2500, deviceId: "dev-3", deletedAt: 2500 }),
      conflictVersions: [],
    }

    const abThenC = reconcileRecordPair(reconcileRecordPair(stateA, stateB), stateC)
    const aThenBc = reconcileRecordPair(stateA, reconcileRecordPair(stateB, stateC))

    expect(canonicalStringify(abThenC.winner)).toBe(canonicalStringify(aThenBc.winner))
    expect(abThenC.conflictVersions.length).toBe(aThenBc.conflictVersions.length)
  })

  it("rejects identical version identity (id, updatedAt, deviceId) with divergent payload", () => {
    const v1 = createMockRecord({
      updatedAt: 3000,
      deviceId: "dev-same",
      cells: { "col-1": "payload 1" },
    })
    const v2 = createMockRecord({
      updatedAt: 3000,
      deviceId: "dev-same",
      cells: { "col-1": "payload 2" },
    })

    expect(() =>
      reconcileRecordPair(
        { winner: v1, conflictVersions: [] },
        { winner: v2, conflictVersions: [] },
      ),
    ).toThrow(/divergent payload/)
  })

  it("rejects records with same id but mismatched immutable schema/result definition", () => {
    const v1 = createMockRecord({ actionId: "action-1" })
    const v2 = createMockRecord({ actionId: "action-altered" })

    expect(() =>
      reconcileRecordPair(
        { winner: v1, conflictVersions: [] },
        { winner: v2, conflictVersions: [] },
      ),
    ).toThrow(/immutable/)
  })

  it("reconcileRecordSets handles full collections across multiple IDs", () => {
    const localRecords = [
      createMockRecord({ id: "rec-1", updatedAt: 2000, deviceId: "dev-1" }),
      createMockRecord({ id: "rec-2", updatedAt: 2000, deviceId: "dev-1" }),
    ]
    const localConflicts: PortableDictionaryRecord[] = []

    const remoteRecords = [
      createMockRecord({ id: "rec-2", updatedAt: 3000, deviceId: "dev-2" }),
      createMockRecord({ id: "rec-3", updatedAt: 1000, deviceId: "dev-3" }),
    ]
    const remoteConflicts: PortableDictionaryRecord[] = []

    const result = reconcileRecordSets(localRecords, localConflicts, remoteRecords, remoteConflicts)

    expect(result.winners.size).toBe(3)
    // rec-1 stays local
    expect(result.winners.get("rec-1")?.updatedAt).toBe(2000)
    // rec-2 takes remote (3000 > 2000), local preserved in conflict_versions
    expect(result.winners.get("rec-2")?.updatedAt).toBe(3000)
    expect(result.conflictsByRecordId.get("rec-2")?.length).toBe(1)
    // rec-3 added from remote
    expect(result.winners.get("rec-3")?.updatedAt).toBe(1000)
  })
})
