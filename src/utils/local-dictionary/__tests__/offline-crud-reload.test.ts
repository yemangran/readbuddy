import type { CreateVocabularyItem } from "../types"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { LocalDictionaryDB } from "../db"
import { LocalDictionaryRepository } from "../repository"
import "fake-indexeddb/auto"

describe("Local Dictionary Offline CRUD & Extension Reload", () => {
  const testDbName = "readfrog-local-reload-test"
  let db: LocalDictionaryDB
  let repo: LocalDictionaryRepository

  beforeEach(async () => {
    db = new LocalDictionaryDB(testDbName)
    await db.open()
    repo = new LocalDictionaryRepository(db)
  })

  afterEach(async () => {
    await db.delete()
    db.close()
  })

  it("persists records across extension reloads and preserves metadata & tombstones", async () => {
    // 1. First run / session
    const meta1 = await repo.getMetadata()
    const originalDeviceId = meta1.deviceId

    const item: CreateVocabularyItem = {
      id: "reload-vocab-1",
      actionId: "default-dictionary",
      actionName: "Dictionary",
      outputSchema: [
        { id: "f-term", name: "Term", type: "string", description: "", speaking: true },
        { id: "f-def", name: "Definition", type: "string", description: "", speaking: false },
      ],
      result: { Term: "persist", Definition: "continue to exist" },
      columns: [
        { id: "c-term", name: "Term", position: 0 },
        { id: "c-def", name: "Definition", position: 1 },
      ],
      mappings: [
        {
          id: "m-1",
          localFieldId: "f-term",
          notebaseColumnId: "c-term",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: {
        "c-term": "persist",
        "c-def": "continue to exist",
      },
    }

    const createRes = await repo.createMany({
      requestId: "req-persist-1",
      items: [item],
    })
    expect(createRes.ok).toBe(true)

    // Close DB connection to simulate extension unloading / service worker suspension
    db.close()

    // 2. Simulate Extension Reload / Service Worker waking up in a new lifecycle
    const reloadedDb = new LocalDictionaryDB(testDbName)
    await reloadedDb.open()
    const reloadedRepo = new LocalDictionaryRepository(reloadedDb)

    // Check deviceId and sequence persisted
    const meta2 = await reloadedRepo.getMetadata()
    expect(meta2.deviceId).toBe(originalDeviceId)
    expect(meta2.changeSequence).toBe(1)

    // Check record retrieved successfully
    const getRes = await reloadedRepo.get("reload-vocab-1")
    expect(getRes.ok).toBe(true)
    if (!getRes.ok) return
    expect(getRes.data.cells["c-term"]).toBe("persist")
    const revision = getRes.data.localRevision

    // 3. Update in the reloaded session
    const updateRes = await reloadedRepo.updateCells({
      requestId: "req-persist-2",
      id: "reload-vocab-1",
      cells: { ...getRes.data.cells, "c-term": "persisted" },
      expectedRevision: revision,
    })
    expect(updateRes.ok).toBe(true)
    if (!updateRes.ok) return
    expect(updateRes.data.cells["c-term"]).toBe("persisted")

    // 4. Delete in reloaded session
    const delRes = await reloadedRepo.delete({
      requestId: "req-persist-3",
      id: "reload-vocab-1",
      expectedRevision: updateRes.data.localRevision,
    })
    expect(delRes.ok).toBe(true)

    // Close and reload again to verify tombstone survives reload
    reloadedDb.close()

    const reloadedDb2 = new LocalDictionaryDB(testDbName)
    await reloadedDb2.open()
    const reloadedRepo2 = new LocalDictionaryRepository(reloadedDb2)

    const listRes = await reloadedRepo2.list()
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) return
    expect(listRes.data.records.length).toBe(0)

    // conflict_versions retains the full state
    const retained = await reloadedDb2.conflictVersions
      .where("id")
      .equals("reload-vocab-1")
      .toArray()
    expect(retained.length).toBe(1)
    expect(retained[0]?.cells["c-term"]).toBe("persisted")

    reloadedDb2.close()
  })
})
