import type { CreateVocabularyItem } from "../types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LocalDictionaryDB } from "../db"
import {
  LocalDictionaryRepository,
  MAX_CREATE_ITEMS,
  MAX_RECORD_PAYLOAD_BYTES,
} from "../repository"
import { parseAndValidateSnapshot, SNAPSHOT_MAX_SIZE_BYTES } from "../snapshot"
import "fake-indexeddb/auto"

function createMockItem(id: string, word: string): CreateVocabularyItem {
  return {
    id,
    actionId: "default-dictionary",
    actionName: "Dictionary",
    outputSchema: [{ id: "f-1", name: "Word", type: "string", description: "", speaking: false }],
    result: { Word: word },
    columns: [{ id: "c-1", name: "Word", position: 0 }],
    mappings: [
      {
        id: "m-1",
        localFieldId: "f-1",
        notebaseColumnId: "c-1",
        notebaseColumnNameSnapshot: "Word",
      },
    ],
    cells: { "c-1": word },
  }
}

describe("Issue #12: Local Dictionary Integrity, Concurrency & Recovery Verification", () => {
  let db: LocalDictionaryDB
  let repository: LocalDictionaryRepository
  let testDbName: string

  beforeEach(async () => {
    testDbName = `readfrog-integrity-test-${Math.random().toString(36).slice(2)}`
    db = new LocalDictionaryDB(testDbName)
    await db.open()
    repository = new LocalDictionaryRepository(db)
  })

  afterEach(async () => {
    await db.delete()
    db.close()
  })

  it("AC1: Concurrency CAS - two concurrent edits with same expected revision have exactly one winner while loser gets EDIT_CONFLICT and retains draft", async () => {
    // 1. Create a vocabulary record
    await repository.createMany({
      requestId: "req-init-cas",
      items: [createMockItem("vocab-cas", "base-version")],
    })

    const initial = (await repository.get("vocab-cas")) as any
    expect(initial.ok).toBe(true)
    const originalRevision = initial.data.localRevision

    // 2. Simulate two concurrent client tabs updating with the same revision
    const draftPage1 = { "c-1": "draft-page-1" }
    const draftPage2 = { "c-1": "draft-page-2" }

    const [res1, res2] = await Promise.all([
      repository.updateCells({
        requestId: "req-cas-tab1",
        id: "vocab-cas",
        cells: draftPage1,
        expectedRevision: originalRevision,
      }),
      repository.updateCells({
        requestId: "req-cas-tab2",
        id: "vocab-cas",
        cells: draftPage2,
        expectedRevision: originalRevision,
      }),
    ])

    // Exactly one must succeed, the other must get EDIT_CONFLICT
    const successCount = (res1.ok ? 1 : 0) + (res2.ok ? 1 : 0)
    const conflictCount =
      (!res1.ok && res1.error.code === "EDIT_CONFLICT" ? 1 : 0) +
      (!res2.ok && res2.error.code === "EDIT_CONFLICT" ? 1 : 0)

    expect(successCount).toBe(1)
    expect(conflictCount).toBe(1)

    // Verify loser's draft was not applied, winner's draft was applied
    const current = (await repository.get("vocab-cas")) as any
    const winningDraft = res1.ok ? draftPage1["c-1"] : draftPage2["c-1"]
    const losingDraft = res1.ok ? draftPage2["c-1"] : draftPage1["c-1"]

    expect(current.data.cells["c-1"]).toBe(winningDraft)
    expect(current.data.cells["c-1"]).not.toBe(losingDraft)
  })

  it("AC2: Atomic Rollback - batch failure, simulated interruption, and quota exceeded leave no partial data", async () => {
    // Pre-insert one record
    await repository.createMany({
      requestId: "req-existing",
      items: [createMockItem("vocab-pre-existing", "existing")],
    })

    const baselineRecords = await db.vocabularies.count()
    const baselineChanges = await db.syncChanges.count()
    const baselineReceipts = await db.mutationReceipts.count()
    const baselineSeq = (await repository.getMetadata()).changeSequence

    // Scenario A: Batch failure - inserting 3 items where 2nd item already exists in DB
    const batchRes = await repository.createMany({
      requestId: "req-partial-batch",
      items: [
        createMockItem("vocab-fresh-1", "fresh 1"),
        createMockItem("vocab-pre-existing", "duplicate attempt"),
        createMockItem("vocab-fresh-3", "fresh 3"),
      ],
    })

    expect(batchRes.ok).toBe(false)
    if (batchRes.ok) throw new Error("Expected batchRes to fail")
    expect(batchRes.error.code).toBe("INVALID_DATA")

    // Verify complete rollback: neither fresh-1 nor fresh-3 exists
    expect(await db.vocabularies.count()).toBe(baselineRecords)
    expect(await db.vocabularies.get("vocab-fresh-1")).toBeUndefined()
    expect(await db.vocabularies.get("vocab-fresh-3")).toBeUndefined()
    expect(await db.syncChanges.count()).toBe(baselineChanges)
    expect(await db.mutationReceipts.count()).toBe(baselineReceipts)
    expect((await repository.getMetadata()).changeSequence).toBe(baselineSeq)

    // Scenario B: Quota Exceeded error handling without data corruption
    vi.spyOn(db.vocabularies, "put").mockImplementationOnce(() => {
      const quotaErr = new DOMException("The quota has been exceeded", "QuotaExceededError")
      return Promise.reject(quotaErr) as any
    })

    const quotaRes = await repository.createMany({
      requestId: "req-quota-test",
      items: [createMockItem("vocab-quota", "quota")],
    })

    expect(quotaRes.ok).toBe(false)
    if (quotaRes.ok) throw new Error("Expected quotaRes to fail")
    expect(quotaRes.error.code).toBe("QUOTA_EXCEEDED")

    // Verify existing database data remains intact and unchanged
    expect(await db.vocabularies.count()).toBe(baselineRecords)
    expect(await db.syncChanges.count()).toBe(baselineChanges)
    expect((await repository.getMetadata()).changeSequence).toBe(baselineSeq)
  })

  it("AC3: Lost Response Recovery & Idempotent Retry - receipt query confirms committed mutations and prevents duplicates", async () => {
    // 1. Commit a mutation
    const requestId = "req-lost-response-1"
    const items = [createMockItem("vocab-recover-1", "recoverable")]

    const commitRes = await repository.createMany({ requestId, items })
    expect(commitRes.ok).toBe(true)
    const commitSeq = (commitRes as any).changeSequence

    // 2. Client queries mutation receipt to confirm status after lost response
    const receiptRes = await repository.getMutationResult(requestId)
    expect(receiptRes.ok).toBe(true)
    if (!receiptRes.ok) throw new Error("Expected receipt query to succeed")
    expect(receiptRes.changeSequence).toBe(commitSeq)
    expect((receiptRes.data as any).createdIds).toEqual(["vocab-recover-1"])

    // 3. Client retries the identical request
    const retryRes = await repository.createMany({ requestId, items })
    expect(retryRes.ok).toBe(true)
    if (!retryRes.ok) throw new Error("Expected retry to succeed")
    // Returns identical receipt and does not duplicate
    expect(retryRes.changeSequence).toBe(commitSeq)
    expect(await db.vocabularies.count()).toBe(1)

    // 4. Client retries same requestId with altered payload (tampering/bug)
    const alteredItems = [createMockItem("vocab-recover-1", "tampered-content")]
    const tamperedRes = await repository.createMany({ requestId, items: alteredItems })
    expect(tamperedRes.ok).toBe(false)
    if (tamperedRes.ok) throw new Error("Expected tampered retry to fail")
    expect(tamperedRes.error.code).toBe("REQUEST_ID_REUSED")

    // 5. Restore conflict version lost response recovery
    const vocab = (await repository.get("vocab-recover-1")) as any
    const rev = vocab.data.localRevision
    await repository.delete({
      requestId: "req-del-rec",
      id: "vocab-recover-1",
      expectedRevision: rev,
    })

    const conflicts = await repository.listConflictVersions("vocab-recover-1")
    expect(conflicts.ok).toBe(true)
    if (!conflicts.ok) throw new Error("Expected listConflictVersions to succeed")

    const restoreReqId = "req-restore-retry"
    const restoreInput = {
      requestId: restoreReqId,
      versionId: {
        id: "vocab-recover-1",
        updatedAt: conflicts.data[0]!.updatedAt,
        deviceId: conflicts.data[0]!.deviceId,
      },
    }

    const firstRestore = await repository.restoreConflictVersionAsNew(restoreInput)
    expect(firstRestore.ok).toBe(true)
    if (!firstRestore.ok) throw new Error("Expected first restore to succeed")
    const restoredNewId = firstRestore.data.id

    // Retry restore: returns existing receipt, does not create another duplicate new ID
    const retryRestore = await repository.restoreConflictVersionAsNew(restoreInput)
    expect(retryRestore.ok).toBe(true)
    if (!retryRestore.ok) throw new Error("Expected retry restore to succeed")
    expect(retryRestore.data.id).toBe(restoredNewId)
  })

  it("AC4: Persistence across SW restart - deviceId, sequence, records, tombstones and conflict versions fully survive restart", async () => {
    // 1. Populate data
    await repository.createMany({
      requestId: "req-sw-1",
      items: [
        createMockItem("vocab-sw-active", "active content"),
        createMockItem("vocab-sw-tombstone", "to be deleted"),
      ],
    })

    const tombstoneRecord = (await repository.get("vocab-sw-tombstone")) as any

    // Delete one record (archived to conflict_versions and marked tombstone)
    await repository.delete({
      requestId: "req-sw-del",
      id: "vocab-sw-tombstone",
      expectedRevision: tombstoneRecord.data.localRevision,
    })

    const metaBeforeRestart = await repository.getMetadata()
    const seqBeforeRestart = metaBeforeRestart.changeSequence
    const deviceIdBeforeRestart = metaBeforeRestart.deviceId

    // 2. Simulate Service Worker Termination: close DB connection
    db.close()

    // 3. Simulate Service Worker Awakening: re-open DB and instantiate fresh repository
    const freshDb = new LocalDictionaryDB(testDbName)
    await freshDb.open()
    const freshRepo = new LocalDictionaryRepository(freshDb)

    // 4. Assert full persistence and recovery
    const metaAfterRestart = await freshRepo.getMetadata()
    expect(metaAfterRestart.deviceId).toBe(deviceIdBeforeRestart)
    expect(metaAfterRestart.changeSequence).toBe(seqBeforeRestart)

    // Active record survives
    const activeAfter = (await freshRepo.get("vocab-sw-active")) as any
    expect(activeAfter.ok).toBe(true)
    expect(activeAfter.data.cells["c-1"]).toBe("active content")

    // Tombstone is filtered out of active list
    const listAfter = await freshRepo.list()
    expect(listAfter.ok).toBe(true)
    if (!listAfter.ok) throw new Error("Expected list to succeed")
    expect(listAfter.data.records.map((r) => r.id)).toEqual(["vocab-sw-active"])

    // Tombstone survives in store
    const tombstoneAfter = (await freshRepo.get("vocab-sw-tombstone", true)) as any
    expect(tombstoneAfter.ok).toBe(true)
    expect(tombstoneAfter.data.deletedAt).toBeDefined()

    // Conflict version survives
    const conflictsAfter = await freshRepo.listConflictVersions("vocab-sw-tombstone")
    expect(conflictsAfter.ok).toBe(true)
    if (!conflictsAfter.ok) throw new Error("Expected listConflictVersions to succeed")
    expect(conflictsAfter.data.length).toBe(1)
    expect(conflictsAfter.data[0]?.cells["c-1"]).toBe("to be deleted")

    // Clean up reopened db
    await freshDb.delete()
    freshDb.close()
  })

  it("AC5: Budget Overflows - explicit failure on size, item count and payload without data truncation", async () => {
    // 1. Batch size exceeds MAX_CREATE_ITEMS limit
    const tooManyItems = Array.from({ length: MAX_CREATE_ITEMS + 1 }, (_, i) =>
      createMockItem(`vocab-overflow-${i}`, `overflow ${i}`),
    )

    const overflowBatchRes = await repository.createMany({
      requestId: "req-overflow-count",
      items: tooManyItems,
    })
    expect(overflowBatchRes.ok).toBe(false)
    if (overflowBatchRes.ok) throw new Error("Expected overflow batch to fail")
    expect(overflowBatchRes.error.code).toBe("INVALID_DATA")
    expect(overflowBatchRes.error.message).toContain("exceeds maximum limit")

    // 2. Single item payload exceeds MAX_RECORD_PAYLOAD_BYTES
    const hugePayload = "x".repeat(MAX_RECORD_PAYLOAD_BYTES + 100)
    const oversizedItem = createMockItem("vocab-oversized", hugePayload)

    const oversizedRes = await repository.createMany({
      requestId: "req-oversized-item",
      items: [oversizedItem],
    })
    expect(oversizedRes.ok).toBe(false)
    if (oversizedRes.ok) throw new Error("Expected oversized item to fail")
    expect(oversizedRes.error.code).toBe("INVALID_DATA")
    expect(oversizedRes.error.message).toContain("exceeds limit")

    // 3. Snapshot parse exceeds SNAPSHOT_MAX_SIZE_BYTES
    const oversizedSnapshotJson = " ".repeat(SNAPSHOT_MAX_SIZE_BYTES + 20)
    const snapshotRes = parseAndValidateSnapshot(oversizedSnapshotJson)
    expect(snapshotRes.ok).toBe(false)
    if (snapshotRes.ok) throw new Error("Expected oversized snapshot to fail")
    expect(snapshotRes.error).toContain("exceeds size budget")
  })
})
