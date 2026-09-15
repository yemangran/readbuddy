import type { CreateVocabularyItem, WebdavConfig } from "../types"
import type { ReviewState } from "@/utils/review/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { createReviewStore, type ReviewStorageDriver } from "@/utils/review/store"
import { LocalDictionaryDB } from "../db"
import { LocalDictionaryRepository } from "../repository"
import { syncWithWebdav, WEBDAV_CONFIG_STORAGE_KEY } from "../webdav"
import "fake-indexeddb/auto"

describe("WebDAV Dual-file Sync & Recycle Bin Purge Cascade", () => {
  const sampleConfig: WebdavConfig = {
    endpoint: "https://dav.example.com/webdav/",
    username: "testuser",
    password: "secretpassword123",
  }

  let db: LocalDictionaryDB
  let repo: LocalDictionaryRepository
  let inMemoryReviewStates: Record<string, ReviewState>
  let mockDriver: ReviewStorageDriver
  let reviewStoreInstance: ReturnType<typeof createReviewStore>

  beforeEach(async () => {
    await storage.removeItem(WEBDAV_CONFIG_STORAGE_KEY)
    const dbName = `readfrog-dual-sync-test-${Math.random().toString(36).slice(2)}`
    db = new LocalDictionaryDB(dbName)
    await db.open()

    inMemoryReviewStates = {}
    mockDriver = {
      getStates: async () => ({ ...inMemoryReviewStates }),
      saveStates: async (states) => {
        inMemoryReviewStates = { ...states }
      },
    }
    reviewStoreInstance = createReviewStore(mockDriver)

    repo = new LocalDictionaryRepository(db, {
      onPurged: async (purgedIds) => {
        await reviewStoreInstance.purgeReviewStates(purgedIds)
      },
    })
  })

  afterEach(async () => {
    await storage.removeItem(WEBDAV_CONFIG_STORAGE_KEY)
    await db.delete()
    db.close()
  })

  it("permanently purging an individual deleted record cascades to purge its review state", async () => {
    // 1. Create a vocabulary record
    const item: CreateVocabularyItem = {
      id: "word-to-purge",
      actionId: "dict",
      actionName: "Dictionary",
      outputSchema: [],
      result: {},
      columns: [{ id: "c1", name: "Word", position: 0 }],
      mappings: [],
      cells: { c1: "ephemeral" },
    }
    const createRes = await repo.createMany({ requestId: "req-create-1", items: [item] })
    expect(createRes.ok).toBe(true)

    // 2. Initialize a review state for this record in reviewStore
    await reviewStoreInstance.saveAllStates({
      "word-to-purge": {
        recordId: "word-to-purge",
        state: "learning",
        due: 2000,
        stability: 1,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 1,
        lapses: 0,
        lastReview: 1000,
      },
      "word-keep": {
        recordId: "word-keep",
        state: "review",
        due: 5000,
        stability: 3,
        difficulty: 4,
        elapsedDays: 1,
        scheduledDays: 3,
        reps: 2,
        lapses: 0,
        lastReview: 1000,
      },
    })

    expect(await reviewStoreInstance.getState("word-to-purge")).toBeDefined()
    expect(await reviewStoreInstance.getState("word-keep")).toBeDefined()

    // 3. Soft delete and permanently purge "word-to-purge"
    const getRes = await repo.get("word-to-purge")
    expect(getRes.ok).toBe(true)
    if (!getRes.ok) throw new Error("word-to-purge not found")

    await repo.delete({
      requestId: "del-1",
      id: "word-to-purge",
      expectedRevision: getRes.data.localRevision,
    })

    const purgeRes = await repo.purge({
      requestId: "purge-1",
      id: "word-to-purge",
    })
    expect(purgeRes.ok).toBe(true)

    // 4. Verification: review state for "word-to-purge" must be purged, but "word-keep" preserved
    expect(await reviewStoreInstance.getState("word-to-purge")).toBeNull()
    expect(await reviewStoreInstance.getState("word-keep")).toBeDefined()
  })

  it("purging all deleted records cascades to purge all orphaned review states", async () => {
    // 1. Create two records
    const item1: CreateVocabularyItem = {
      id: "deleted-1",
      actionId: "dict",
      actionName: "Dictionary",
      outputSchema: [],
      result: {},
      columns: [{ id: "c1", name: "Word", position: 0 }],
      mappings: [],
      cells: { c1: "deleted1" },
    }
    const item2: CreateVocabularyItem = {
      id: "deleted-2",
      actionId: "dict",
      actionName: "Dictionary",
      outputSchema: [],
      result: {},
      columns: [{ id: "c1", name: "Word", position: 0 }],
      mappings: [],
      cells: { c1: "deleted2" },
    }
    const itemActive: CreateVocabularyItem = {
      id: "active-1",
      actionId: "dict",
      actionName: "Dictionary",
      outputSchema: [],
      result: {},
      columns: [{ id: "c1", name: "Word", position: 0 }],
      mappings: [],
      cells: { c1: "active" },
    }
    const createRes = await repo.createMany({
      requestId: "req-create-2",
      items: [item1, item2, itemActive],
    })
    expect(createRes.ok).toBe(true)

    // Save review states for all three
    await reviewStoreInstance.saveAllStates({
      "deleted-1": {
        recordId: "deleted-1",
        state: "learning",
        due: 2000,
        stability: 1,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 1,
        lapses: 0,
        lastReview: 1000,
      },
      "deleted-2": {
        recordId: "deleted-2",
        state: "learning",
        due: 2000,
        stability: 1,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 1,
        lapses: 0,
        lastReview: 1000,
      },
      "active-1": {
        recordId: "active-1",
        state: "review",
        due: 5000,
        stability: 3,
        difficulty: 4,
        elapsedDays: 1,
        scheduledDays: 3,
        reps: 2,
        lapses: 0,
        lastReview: 1000,
      },
      "phantom-orphan": {
        recordId: "phantom-orphan",
        state: "new",
        due: 1000,
        stability: 0,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        lastReview: null,
      },
    })

    // Soft delete items 1 and 2
    const rec1 = await repo.get("deleted-1")
    const rec2 = await repo.get("deleted-2")
    if (!rec1.ok || !rec2.ok) throw new Error("Records not found")
    await repo.delete({
      requestId: "d1",
      id: "deleted-1",
      expectedRevision: rec1.data.localRevision,
    })
    await repo.delete({
      requestId: "d2",
      id: "deleted-2",
      expectedRevision: rec2.data.localRevision,
    })

    // Purge all deleted
    const purgeAllResult = await repo.purgeAllDeleted()
    expect(purgeAllResult.ok).toBe(true)
    if (!purgeAllResult.ok) throw new Error("purgeAllDeleted failed")
    expect(purgeAllResult.data.purgedCount).toBe(2)

    // Check review states: deleted-1 and deleted-2 must be removed
    expect(await reviewStoreInstance.getState("deleted-1")).toBeNull()
    expect(await reviewStoreInstance.getState("deleted-2")).toBeNull()
    expect(await reviewStoreInstance.getState("active-1")).toBeDefined()

    // Also verify purgeOrphanedReviewStates cleans up any phantom orphans
    const activeRecords = await repo.list({ pageSize: 100 })
    expect(activeRecords.ok).toBe(true)
    if (!activeRecords.ok) throw new Error("list failed")
    const activeIds = activeRecords.data.records.map((r) => r.id)
    const purgedOrphans = await reviewStoreInstance.purgeOrphanedReviewStates(activeIds)
    expect(purgedOrphans).toBe(1)
    expect(await reviewStoreInstance.getState("phantom-orphan")).toBeNull()
  })

  it("dual-file WebDAV synchronization uploads readfrog.json and readfrog-reviews.json concurrently", async () => {
    // 1. Create a vocabulary record and a review state
    const item: CreateVocabularyItem = {
      id: "dual-vocab-1",
      actionId: "dict",
      actionName: "Dictionary",
      outputSchema: [],
      result: {},
      columns: [{ id: "c1", name: "Word", position: 0 }],
      mappings: [],
      cells: { c1: "dual-sync" },
    }
    const createRes = await repo.createMany({ requestId: "req-create-3", items: [item] })
    expect(createRes.ok).toBe(true)

    await reviewStoreInstance.saveAllStates({
      "dual-vocab-1": {
        recordId: "dual-vocab-1",
        state: "learning",
        due: 2000,
        stability: 1.5,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 1,
        lapses: 0,
        lastReview: 1000,
      },
    })

    // 2. Mock WebDAV remote storage containing mock files
    const remoteFiles = new Map<string, { body: string; etag: string }>()

    const mockFetch = vi.fn<typeof fetch>(async (url: any, opts?: any) => {
      const method = opts?.method || "GET"
      if (url.endsWith("readfrog.json")) {
        if (method === "GET") {
          const file = remoteFiles.get("readfrog.json")
          if (!file) return new Response(null, { status: 404 })
          return new Response(file.body, { status: 200, headers: { ETag: file.etag } })
        }
        if (method === "PUT") {
          const etag = `"vocab-etag-${Date.now()}"`
          remoteFiles.set("readfrog.json", { body: opts.body, etag })
          return new Response(null, { status: 201, headers: { ETag: etag } })
        }
      }

      if (url.endsWith("readfrog-reviews.json")) {
        if (method === "GET") {
          const file = remoteFiles.get("readfrog-reviews.json")
          if (!file) return new Response(null, { status: 404 })
          return new Response(file.body, { status: 200, headers: { ETag: file.etag } })
        }
        if (method === "PUT") {
          const etag = `"reviews-etag-${Date.now()}"`
          remoteFiles.set("readfrog-reviews.json", { body: opts.body, etag })
          return new Response(null, { status: 201, headers: { ETag: etag } })
        }
      }

      throw new Error(`Unhandled request: ${method} ${url}`)
    })

    // 3. Execute dual-file syncWithWebdav
    const syncRes = await syncWithWebdav(
      repo,
      sampleConfig,
      { syncReviews: true, reviewStoreInstance },
      mockFetch,
    )

    expect(syncRes.ok).toBe(true)
    expect(syncRes.remoteUploaded).toBe(true)

    // 4. Verify both files were uploaded to WebDAV
    expect(remoteFiles.has("readfrog.json")).toBe(true)
    expect(remoteFiles.has("readfrog-reviews.json")).toBe(true)

    const vocabContent = remoteFiles.get("readfrog.json")!.body
    const reviewsContent = remoteFiles.get("readfrog-reviews.json")!.body

    expect(vocabContent).toContain("dual-vocab-1")
    expect(vocabContent).toContain("dual-sync")
    expect(reviewsContent).toContain("readfrog-reviews")
    expect(reviewsContent).toContain("dual-vocab-1")
  })
})
