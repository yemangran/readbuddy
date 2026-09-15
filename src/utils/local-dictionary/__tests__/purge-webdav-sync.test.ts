import type { CreateVocabularyItem, WebdavConfig } from "../types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LocalDictionaryDB } from "../db"
import { LocalDictionaryRepository } from "../repository"
import { syncWithWebdav } from "../webdav"
import "fake-indexeddb/auto"

describe("Purge and WebDAV Sync Reproduction", () => {
  const sampleConfig: WebdavConfig = {
    endpoint: "https://dav.example.com/webdav/",
    username: "testuser",
    password: "secretpassword123",
  }

  let db: LocalDictionaryDB
  let repo: LocalDictionaryRepository

  beforeEach(async () => {
    const dbName = `readfrog-test-purge-${Math.random().toString(36).slice(2)}`
    db = new LocalDictionaryDB(dbName)
    await db.open()
    repo = new LocalDictionaryRepository(db)
  })

  afterEach(async () => {
    await db.delete()
    db.close()
  })

  it("after purging all deleted items in recycle bin, WebDAV sync must NOT resurrect them and must remove them from WebDAV snapshot", async () => {
    // 1. Create a vocabulary word
    const item: CreateVocabularyItem = {
      id: "vocab-1",
      actionId: "dict-act",
      actionName: "Dictionary",
      outputSchema: [
        { id: "term", name: "Term", type: "string", description: "", speaking: false },
      ],
      result: { term: "apple" },
      columns: [{ id: "c1", name: "Term", position: 0 }],
      mappings: [
        {
          id: "m1",
          localFieldId: "term",
          notebaseColumnId: "c1",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: { c1: "apple" },
    }
    const createRes = await repo.createMany({ requestId: "req-create-1", items: [item] })
    expect(createRes.ok).toBe(true)
    if (!createRes.ok) throw new Error(createRes.error.message)
    const wordId = createRes.data.createdIds[0]!
    expect(wordId).toBeDefined()

    // 2. Soft-delete word (moves to trash)
    const existingRec = await repo.get(wordId)
    expect(existingRec.ok).toBe(true)
    if (!existingRec.ok) throw new Error(existingRec.error.message)
    const delRes = await repo.delete({
      requestId: "req-del-1",
      id: wordId,
      expectedRevision: existingRec.data.localRevision,
    })
    expect(delRes.ok).toBe(true)

    // Check it is in trash
    const trashBeforeSync = await repo.list({ deletedOnly: true })
    expect(trashBeforeSync.ok).toBe(true)
    if (!trashBeforeSync.ok) throw new Error(trashBeforeSync.error.message)
    expect(trashBeforeSync.data.total).toBe(1)

    // 3. WebDAV initial sync (uploads snapshot containing the soft-deleted word to remote)
    let remoteSnapshotString = ""
    let remoteEtag = '"etag-1"'

    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          if (!remoteSnapshotString) {
            return Promise.resolve(new Response("", { status: 404 }))
          }
          return Promise.resolve(
            new Response(remoteSnapshotString, {
              status: 200,
              headers: { etag: remoteEtag },
            }),
          )
        }
        if (init.method === "PUT") {
          remoteSnapshotString = init.body as string
          remoteEtag = `"${Math.random().toString(36).slice(2)}"`
          return Promise.resolve(new Response("", { status: 200, headers: { etag: remoteEtag } }))
        }
        return Promise.reject(new Error("Unexpected request"))
      })

    const initialSync = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)
    expect(initialSync.ok).toBe(true)
    expect(remoteSnapshotString).toContain("apple")
    expect(remoteSnapshotString).toContain(wordId)

    // 4. User clicks "清空回收站" (Purge all deleted records)
    const purgeRes = await repo.purgeAllDeleted()
    expect(purgeRes.ok).toBe(true)
    if (!purgeRes.ok) throw new Error(purgeRes.error.message)
    expect(purgeRes.data.purgedCount).toBe(1)

    // Verify local recycle bin is immediately 0
    const trashAfterPurge = await repo.list({ deletedOnly: true })
    expect(trashAfterPurge.ok).toBe(true)
    if (!trashAfterPurge.ok) throw new Error(trashAfterPurge.error.message)
    expect(trashAfterPurge.data.total).toBe(0)

    // 5. Subsequent WebDAV sync runs (triggered automatically or manually)
    const syncAfterPurge = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)
    expect(syncAfterPurge.ok).toBe(true)

    // SOT Check 1: Did WebDAV upload an updated snapshot without the purged word?
    expect(remoteSnapshotString).not.toContain("apple")
    expect(remoteSnapshotString).not.toContain(wordId)

    // SOT Check 2: Is the local recycle bin STILL empty, or was it resurrected by WebDAV?
    const trashAfterSync = await repo.list({ deletedOnly: true })
    expect(trashAfterSync.ok).toBe(true)
    if (!trashAfterSync.ok) throw new Error(trashAfterSync.error.message)
    expect(trashAfterSync.data.total).toBe(0)
  })

  it("after purging an individual record via repo.purge, WebDAV sync must NOT resurrect it and must remove it from WebDAV snapshot", async () => {
    // 1. Create two vocabulary words
    const item1: CreateVocabularyItem = {
      id: "vocab-keep",
      actionId: "dict-act",
      actionName: "Dictionary",
      outputSchema: [
        { id: "term", name: "Term", type: "string", description: "", speaking: false },
      ],
      result: { term: "banana" },
      columns: [{ id: "c1", name: "Term", position: 0 }],
      mappings: [
        {
          id: "m1",
          localFieldId: "term",
          notebaseColumnId: "c1",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: { c1: "banana" },
    }
    const item2: CreateVocabularyItem = {
      id: "vocab-purge",
      actionId: "dict-act",
      actionName: "Dictionary",
      outputSchema: [
        { id: "term", name: "Term", type: "string", description: "", speaking: false },
      ],
      result: { term: "orange" },
      columns: [{ id: "c1", name: "Term", position: 0 }],
      mappings: [
        {
          id: "m1",
          localFieldId: "term",
          notebaseColumnId: "c1",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: { c1: "orange" },
    }
    await repo.createMany({ requestId: "req-create-multi", items: [item1, item2] })

    // Soft-delete item2 into recycle bin
    const item2Rec = await repo.get("vocab-purge")
    if (!item2Rec.ok) throw new Error("not found")
    await repo.delete({
      requestId: "req-del-2",
      id: "vocab-purge",
      expectedRevision: item2Rec.data.localRevision,
    })

    // Sync to WebDAV
    let remoteSnapshotString = ""
    let remoteEtag = '"etag-1"'
    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          if (!remoteSnapshotString) return Promise.resolve(new Response("", { status: 404 }))
          return Promise.resolve(
            new Response(remoteSnapshotString, { status: 200, headers: { etag: remoteEtag } }),
          )
        }
        if (init.method === "PUT") {
          remoteSnapshotString = init.body as string
          remoteEtag = `"${Math.random().toString(36).slice(2)}"`
          return Promise.resolve(new Response("", { status: 200, headers: { etag: remoteEtag } }))
        }
        return Promise.reject(new Error("Unexpected request"))
      })

    await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)
    expect(remoteSnapshotString).toContain("orange")
    expect(remoteSnapshotString).toContain("banana")

    // Purge single record
    const purgeRes = await repo.purge({ requestId: "req-purge-single", id: "vocab-purge" })
    expect(purgeRes.ok).toBe(true)

    // Sync again
    await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)

    // "orange" must be purged from WebDAV, but "banana" must remain
    expect(remoteSnapshotString).not.toContain("orange")
    expect(remoteSnapshotString).toContain("banana")

    // Local trash must be 0
    const trashAfterSync = await repo.list({ deletedOnly: true })
    expect(trashAfterSync.ok).toBe(true)
    if (!trashAfterSync.ok) throw new Error(trashAfterSync.error.message)
    expect(trashAfterSync.data.total).toBe(0)

    // Active records must still have banana
    const activeAfterSync = await repo.list()
    expect(activeAfterSync.ok).toBe(true)
    if (!activeAfterSync.ok) throw new Error(activeAfterSync.error.message)
    expect(activeAfterSync.data.total).toBe(1)
    expect(activeAfterSync.data.records[0]?.id).toBe("vocab-keep")
  })
})
