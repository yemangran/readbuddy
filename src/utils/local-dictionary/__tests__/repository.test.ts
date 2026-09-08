import type { CreateVocabularyItem } from "../types"
import type { SelectionToolbarCustomActionOutputField } from "@/types/config/selection-toolbar"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { LocalDictionaryDB } from "../db"
import { LocalDictionaryRepository } from "../repository"
import "fake-indexeddb/auto"

function makeField(id: string, name: string): SelectionToolbarCustomActionOutputField {
  return { id, name, type: "string", description: "", speaking: false }
}

describe("LocalDictionaryRepository", () => {
  let db: LocalDictionaryDB
  let repository: LocalDictionaryRepository

  beforeEach(async () => {
    const dbName = `readfrog-local-test-${Math.random().toString(36).slice(2)}`
    db = new LocalDictionaryDB(dbName)
    await db.open()
    repository = new LocalDictionaryRepository(db)
  })

  afterEach(async () => {
    await db.delete()
    db.close()
  })

  it("initializes deviceId and changeSequence on first access", async () => {
    const meta = await repository.getMetadata()
    expect(meta.deviceId).toBeDefined()
    expect(typeof meta.deviceId).toBe("string")
    expect(meta.changeSequence).toBe(0)

    const meta2 = await repository.getMetadata()
    expect(meta2.deviceId).toBe(meta.deviceId)
  })

  it("creates vocabularies atomically and records sync changes + receipt", async () => {
    const requestId = "req-1"
    const item: CreateVocabularyItem = {
      id: "vocab-1",
      actionId: "default-dictionary",
      actionName: "Dictionary",
      outputSchema: [
        makeField("default-dictionary-term", "Term"),
        makeField("default-dictionary-definition", "Definition"),
      ],
      result: { Term: "toad", Definition: "An amphibian" },
      columns: [
        { id: "col-term", name: "Term", position: 0, config: { type: "string" } },
        { id: "col-def", name: "Definition", position: 1, config: { type: "string" } },
      ],
      mappings: [
        {
          id: "map-1",
          localFieldId: "default-dictionary-term",
          notebaseColumnId: "col-term",
          notebaseColumnNameSnapshot: "Term",
        },
        {
          id: "map-2",
          localFieldId: "default-dictionary-definition",
          notebaseColumnId: "col-def",
          notebaseColumnNameSnapshot: "Definition",
        },
      ],
      cells: {
        "col-term": "toad",
        "col-def": "An amphibian",
      },
    }

    const res = await repository.createMany({
      requestId,
      items: [item],
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.createdIds).toEqual(["vocab-1"])
    expect(res.changeSequence).toBe(1)

    const listRes = await repository.list({ page: 1, pageSize: 10 })
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) return
    expect(listRes.data.total).toBe(1)
    expect(listRes.data.records[0]?.id).toBe("vocab-1")
    expect(listRes.data.records[0]?.cells["col-term"]).toBe("toad")
    expect(listRes.data.records[0]?.localRevision).toBeDefined()
  })

  it("handles idempotent create retry with identical requestId", async () => {
    const requestId = "req-retry"
    const item: CreateVocabularyItem = {
      id: "vocab-retry",
      actionId: "default-dictionary",
      actionName: "Dictionary",
      outputSchema: [makeField("f-1", "Term")],
      result: { Term: "frog" },
      columns: [{ id: "c-1", name: "Term", position: 0 }],
      mappings: [
        {
          id: "m-1",
          localFieldId: "f-1",
          notebaseColumnId: "c-1",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: { "c-1": "frog" },
    }

    const first = await repository.createMany({ requestId, items: [item] })
    expect(first.ok).toBe(true)

    const retry = await repository.createMany({ requestId, items: [item] })
    expect(retry.ok).toBe(true)
    if (!retry.ok || !first.ok) return
    expect(retry.changeSequence).toBe(first.changeSequence)
    expect(retry.data).toEqual(first.data)
  })

  it("rejects reused requestId with different payload", async () => {
    const requestId = "req-conflict"
    const itemA: CreateVocabularyItem = {
      id: "vocab-a",
      actionId: "default-dictionary",
      actionName: "Dictionary",
      outputSchema: [],
      result: {},
      columns: [],
      mappings: [],
      cells: {},
    }
    const itemB: CreateVocabularyItem = {
      id: "vocab-b",
      actionId: "default-dictionary",
      actionName: "Dictionary",
      outputSchema: [],
      result: {},
      columns: [],
      mappings: [],
      cells: {},
    }

    await repository.createMany({ requestId, items: [itemA] })
    const second = await repository.createMany({ requestId, items: [itemB] })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe("REQUEST_ID_REUSED")
  })

  it("updates cells with expectedRevision and detects edit conflicts", async () => {
    const item: CreateVocabularyItem = {
      id: "vocab-cas",
      actionId: "default-dictionary",
      actionName: "Dictionary",
      outputSchema: [makeField("f-1", "Term")],
      result: { Term: "apple" },
      columns: [{ id: "c-1", name: "Term", position: 0 }],
      mappings: [
        {
          id: "m-1",
          localFieldId: "f-1",
          notebaseColumnId: "c-1",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: { "c-1": "apple" },
    }

    await repository.createMany({ requestId: "req-create", items: [item] })
    const getRes = await repository.get("vocab-cas")
    expect(getRes.ok).toBe(true)
    if (!getRes.ok) return
    const initialRevision = getRes.data.localRevision

    const updateRes = await repository.updateCells({
      requestId: "req-update-1",
      id: "vocab-cas",
      cells: { "c-1": "apple edited" },
      expectedRevision: initialRevision,
    })
    expect(updateRes.ok).toBe(true)
    if (!updateRes.ok) return
    expect(updateRes.data.cells["c-1"]).toBe("apple edited")
    expect(updateRes.data.localRevision).not.toBe(initialRevision)

    const staleRes = await repository.updateCells({
      requestId: "req-update-stale",
      id: "vocab-cas",
      cells: { "c-1": "apple stale" },
      expectedRevision: initialRevision,
    })
    expect(staleRes.ok).toBe(false)
    if (staleRes.ok) return
    expect(staleRes.error.code).toBe("EDIT_CONFLICT")
  })

  it("deletes record as tombstone, archives previous version in conflict_versions, and excludes from active list", async () => {
    const item: CreateVocabularyItem = {
      id: "vocab-del",
      actionId: "default-dictionary",
      actionName: "Dictionary",
      outputSchema: [makeField("f-1", "Term")],
      result: { Term: "banana" },
      columns: [{ id: "c-1", name: "Term", position: 0 }],
      mappings: [
        {
          id: "m-1",
          localFieldId: "f-1",
          notebaseColumnId: "c-1",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: { "c-1": "banana" },
    }

    await repository.createMany({ requestId: "req-create-del", items: [item] })
    const getRes = await repository.get("vocab-del")
    if (!getRes.ok) throw new Error("not found")

    const delRes = await repository.delete({
      requestId: "req-del",
      id: "vocab-del",
      expectedRevision: getRes.data.localRevision,
    })
    expect(delRes.ok).toBe(true)

    const listRes = await repository.list({ page: 1, pageSize: 10 })
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) return
    expect(listRes.data.records.length).toBe(0)

    const getDeleted = await repository.get("vocab-del")
    expect(getDeleted.ok).toBe(false)
    if (getDeleted.ok) return
    expect(getDeleted.error.code).toBe("NOT_FOUND")

    const retainedVersions = await db.conflictVersions.where("id").equals("vocab-del").toArray()
    expect(retainedVersions.length).toBe(1)
    expect(retainedVersions[0]?.cells["c-1"]).toBe("banana")
  })

  it("supports search, filtering by actionId, and pagination", async () => {
    const items: CreateVocabularyItem[] = [
      {
        id: "vocab-1",
        actionId: "default-dictionary",
        actionName: "Dictionary",
        outputSchema: [makeField("f-1", "Term")],
        result: { Term: "aardvark" },
        columns: [{ id: "c-1", name: "Term", position: 0 }],
        mappings: [
          {
            id: "m-1",
            localFieldId: "f-1",
            notebaseColumnId: "c-1",
            notebaseColumnNameSnapshot: "Term",
          },
        ],
        cells: { "c-1": "aardvark" },
      },
      {
        id: "vocab-2",
        actionId: "custom-grammar",
        actionName: "Grammar",
        outputSchema: [makeField("f-1", "Point")],
        result: { Point: "subjunctive" },
        columns: [{ id: "c-1", name: "Point", position: 0 }],
        mappings: [
          {
            id: "m-1",
            localFieldId: "f-1",
            notebaseColumnId: "c-1",
            notebaseColumnNameSnapshot: "Point",
          },
        ],
        cells: { "c-1": "subjunctive" },
      },
      {
        id: "vocab-3",
        actionId: "default-dictionary",
        actionName: "Dictionary",
        outputSchema: [makeField("f-1", "Term")],
        result: { Term: "bear" },
        columns: [{ id: "c-1", name: "Term", position: 0 }],
        mappings: [
          {
            id: "m-1",
            localFieldId: "f-1",
            notebaseColumnId: "c-1",
            notebaseColumnNameSnapshot: "Term",
          },
        ],
        cells: { "c-1": "bear" },
      },
    ]

    await repository.createMany({ requestId: "req-bulk", items })

    const searchRes = await repository.list({ search: "aard" })
    expect(searchRes.ok).toBe(true)
    if (!searchRes.ok) return
    expect(searchRes.data.total).toBe(1)
    expect(searchRes.data.records[0]?.id).toBe("vocab-1")

    const actionFilterRes = await repository.list({ actionId: "custom-grammar" })
    expect(actionFilterRes.ok).toBe(true)
    if (!actionFilterRes.ok) return
    expect(actionFilterRes.data.total).toBe(1)
    expect(actionFilterRes.data.records[0]?.id).toBe("vocab-2")

    const page1Res = await repository.list({ page: 1, pageSize: 2 })
    expect(page1Res.ok).toBe(true)
    if (!page1Res.ok) return
    expect(page1Res.data.records.length).toBe(2)
    expect(page1Res.data.total).toBe(3)

    const page2Res = await repository.list({ page: 2, pageSize: 2 })
    expect(page2Res.ok).toBe(true)
    if (!page2Res.ok) return
    expect(page2Res.data.records.length).toBe(1)

    const receiptRes = await repository.getMutationResult("req-bulk")
    expect(receiptRes.ok).toBe(true)
    if (!receiptRes.ok) return
    expect((receiptRes.data as any).createdIds).toEqual(["vocab-1", "vocab-2", "vocab-3"])
  })
})
