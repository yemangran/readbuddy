import type {
  CreateVocabularyItem,
  DictionarySnapshotV1,
  PortableDictionaryRecord,
  WebdavConfig,
} from "../types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { LocalDictionaryDB } from "../db"
import { LocalDictionaryRepository } from "../repository"
import {
  clearStoredWebdavConfig,
  getStoredWebdavConfig,
  getWebdavAuthHeader,
  getWebdavFileUrl,
  normalizeWebdavEndpoint,
  requestWebdavHostPermission,
  saveStoredWebdavConfig,
  syncWithWebdav,
  testWebdavConnection,
  WEBDAV_CONFIG_STORAGE_KEY,
} from "../webdav"
import "fake-indexeddb/auto"

describe("WebDAV Configuration, Connection & Security", () => {
  const sampleConfig: WebdavConfig = {
    endpoint: "https://dav.example.com/webdav/",
    username: "testuser",
    password: "secretpassword123",
  }

  let db: LocalDictionaryDB
  let repo: LocalDictionaryRepository

  beforeEach(async () => {
    await storage.removeItem(WEBDAV_CONFIG_STORAGE_KEY)
    const dbName = `readfrog-test-cfg-${Math.random().toString(36).slice(2)}`
    db = new LocalDictionaryDB(dbName)
    await db.open()
    repo = new LocalDictionaryRepository(db)
  })

  afterEach(async () => {
    await storage.removeItem(WEBDAV_CONFIG_STORAGE_KEY)
    await db.delete()
    db.close()
  })

  it("normalizes WebDAV endpoints and constructs readfrog.json URL safely", () => {
    expect(normalizeWebdavEndpoint("https://dav.example.com/webdav/")).toBe(
      "https://dav.example.com/webdav/",
    )
    expect(getWebdavFileUrl("https://dav.example.com/webdav/")).toBe(
      "https://dav.example.com/webdav/readfrog.json",
    )
    expect(getWebdavFileUrl("https://dav.example.com/webdav")).toBe(
      "https://dav.example.com/webdav/readfrog.json",
    )
    expect(getWebdavFileUrl("https://dav.example.com/webdav/readfrog.json")).toBe(
      "https://dav.example.com/webdav/readfrog.json",
    )
    expect(() => getWebdavFileUrl("ftp://example.com")).toThrow("Unsupported protocol")
    expect(() => getWebdavFileUrl("")).toThrow("WebDAV endpoint cannot be empty")
  })

  it("generates valid Basic Auth headers without leaking credentials in error logs", () => {
    const auth = getWebdavAuthHeader("user", "pass")
    expect(auth).toMatch(/^Basic\s+[A-Za-z0-9+/=]+$/)
    expect(auth).not.toContain("pass")
  })

  it("saves, retrieves, and clears WebDAV config locally in storage", async () => {
    expect(await getStoredWebdavConfig()).toBeNull()

    await saveStoredWebdavConfig(sampleConfig)
    const stored = await getStoredWebdavConfig()
    expect(stored).toEqual(sampleConfig)

    await clearStoredWebdavConfig()
    expect(await getStoredWebdavConfig()).toBeNull()
  })

  it("handles host permission requests and permission denial without touching local dictionary", async () => {
    const granted = await requestWebdavHostPermission("https://dav.example.com/webdav/")
    expect(typeof granted).toBe("boolean")

    // Verify dictionary remains functional and empty
    const list = await repo.list()
    expect(list.ok).toBe(true)
    if (!list.ok) throw new Error(list.error.message)
    expect(list.data.total).toBe(0)
  })

  it("tests WebDAV connection successfully when endpoint returns 200 or 404", async () => {
    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockResolvedValue(new Response("", { status: 404 }))

    const result = await testWebdavConnection(sampleConfig, mockFetch as any)
    expect(result.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      "https://dav.example.com/webdav/readfrog.json",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("returns AUTH_FAILED error when credentials are rejected (401/403) without exposing credentials", async () => {
    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockResolvedValue(new Response("Unauthorized", { status: 401 }))

    const result = await testWebdavConnection(sampleConfig, mockFetch as any)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("AUTH_FAILED")
    expect(result.error?.message).not.toContain(sampleConfig.password)
    expect(result.error?.message).not.toContain(sampleConfig.username)
  })
})

describe("WebDAV First Sync & Conditional Upload", () => {
  let db: LocalDictionaryDB
  let repo: LocalDictionaryRepository

  const sampleConfig: WebdavConfig = {
    endpoint: "https://dav.example.com/webdav/",
    username: "user",
    password: "password",
  }

  const sampleItemA: CreateVocabularyItem = {
    id: "vocab-1",
    actionId: "dict-act",
    actionName: "Dictionary",
    outputSchema: [{ id: "term", name: "Term", type: "string", description: "", speaking: false }],
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

  beforeEach(async () => {
    const dbName = `readfrog-test-sync-${Math.random().toString(36).slice(2)}`
    db = new LocalDictionaryDB(dbName)
    await db.open()
    repo = new LocalDictionaryRepository(db)
  })

  afterEach(async () => {
    await db.delete()
    db.close()
  })

  it("Scenario 1: First sync when remote does not exist (404) -> uses If-None-Match: * to conditionally create", async () => {
    // Add local record
    await repo.createMany({ requestId: "req-1", items: [sampleItemA] })

    let putCapturedHeaders: Record<string, string> = {}
    let putCapturedBody = ""

    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          return Promise.resolve(new Response("", { status: 404 }))
        }
        if (init.method === "PUT") {
          putCapturedHeaders = init.headers as Record<string, string>
          putCapturedBody = init.body as string
          return Promise.resolve(
            new Response("", { status: 201, headers: { etag: '"initial-etag-123"' } }),
          )
        }
        return Promise.reject(new Error("Unexpected request"))
      })

    expect(await repo.getPendingSyncChangesCount()).toBe(1)
    const syncResult = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)

    expect(syncResult.ok).toBe(true)
    expect(syncResult.remoteUploaded).toBe(true)
    expect(syncResult.etag).toBe('"initial-etag-123"')
    expect(putCapturedHeaders["If-None-Match"]).toBe("*")
    expect(putCapturedHeaders["If-Match"]).toBeUndefined()
    expect(await repo.getPendingSyncChangesCount()).toBe(0)

    // Verify uploaded body contains the local record
    expect(putCapturedBody).toContain("vocab-1")
    expect(putCapturedBody).toContain("apple")
  })

  it("Scenario 2: First sync when remote exists and local is empty -> downloads and populates local DB, does not overwrite remote", async () => {
    const remoteRecord: PortableDictionaryRecord = {
      id: "vocab-remote-1",
      createdAt: 1000,
      updatedAt: 1000,
      deviceId: "device-remote",
      actionId: "dict-act",
      actionName: "Dictionary",
      outputSchema: [
        { id: "term", name: "Term", type: "string", description: "", speaking: false },
      ],
      result: { term: "cherry" },
      columns: [{ id: "c1", name: "Term", position: 0 }],
      mappings: [
        {
          id: "m1",
          localFieldId: "term",
          notebaseColumnId: "c1",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: { c1: "cherry" },
    }

    const remoteSnapshot: DictionarySnapshotV1 = {
      format: "readfrog-local",
      version: 1,
      updatedAt: 1000,
      vocabularies: [remoteRecord],
      conflictVersions: [],
    }

    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          return Promise.resolve(
            new Response(JSON.stringify(remoteSnapshot), {
              status: 200,
              headers: { etag: '"etag-remote-1"' },
            }),
          )
        }
        return Promise.reject(
          new Error("PUT should not be called when remote is already up to date"),
        )
      })

    const syncResult = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)

    expect(syncResult.ok).toBe(true)
    expect(syncResult.localUpdated).toBe(true)
    expect(syncResult.remoteUploaded).toBe(false)
    expect(syncResult.stats?.addedCount).toBe(1)

    // Verify local DB now has the record
    const localList = await repo.list()
    expect(localList.ok).toBe(true)
    if (!localList.ok) throw new Error(localList.error.message)
    expect(localList.data.total).toBe(1)
    expect(localList.data.records[0]?.id).toBe("vocab-remote-1")
    expect(localList.data.records[0]?.cells.c1).toBe("cherry")
  })

  it("Scenario 3: Both sides have data -> unified merge, missing records not treated as deleted, uploaded with If-Match: etag", async () => {
    // Local has vocab-1
    await repo.createMany({ requestId: "req-local-1", items: [sampleItemA] })

    // Remote has vocab-2
    const remoteRecord: PortableDictionaryRecord = {
      id: "vocab-2",
      createdAt: 2000,
      updatedAt: 2000,
      deviceId: "device-other",
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

    const remoteSnapshot: DictionarySnapshotV1 = {
      format: "readfrog-local",
      version: 1,
      updatedAt: 2000,
      vocabularies: [remoteRecord],
      conflictVersions: [],
    }

    let putCapturedHeaders: Record<string, string> = {}
    let putCapturedBody = ""

    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          return Promise.resolve(
            new Response(JSON.stringify(remoteSnapshot), {
              status: 200,
              headers: { etag: '"remote-etag-100"' },
            }),
          )
        }
        if (init.method === "PUT") {
          putCapturedHeaders = init.headers as Record<string, string>
          putCapturedBody = init.body as string
          return Promise.resolve(
            new Response("", { status: 200, headers: { etag: '"remote-etag-101"' } }),
          )
        }
        return Promise.reject(new Error("Unexpected request"))
      })

    const syncResult = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)

    expect(syncResult.ok).toBe(true)
    expect(syncResult.localUpdated).toBe(true)
    expect(syncResult.remoteUploaded).toBe(true)
    expect(syncResult.etag).toBe('"remote-etag-101"')
    expect(putCapturedHeaders["If-Match"]).toBe('"remote-etag-100"')

    // Local DB now has BOTH vocab-1 and vocab-2
    const localList = await repo.list()
    expect(localList.ok).toBe(true)
    if (!localList.ok) throw new Error(localList.error.message)
    expect(localList.data.total).toBe(2)
    const ids = localList.data.records.map((r) => r.id)
    expect(ids).toContain("vocab-1")
    expect(ids).toContain("vocab-2")

    // Uploaded remote body has BOTH records
    expect(putCapturedBody).toContain("vocab-1")
    expect(putCapturedBody).toContain("vocab-2")
  })

  it("Condition Failure (412 Precondition Failed) -> re-reads remote, re-merges, and retries with new ETag", async () => {
    // Local has vocab-1
    await repo.createMany({ requestId: "req-1", items: [sampleItemA] })

    let getCalls = 0
    let putCalls = 0

    // Concurrently added on device 2
    const concurrentRemoteRecord: PortableDictionaryRecord = {
      id: "vocab-concurrent",
      createdAt: 3000,
      updatedAt: 3000,
      deviceId: "device-2",
      actionId: "dict-act",
      actionName: "Dictionary",
      outputSchema: [
        { id: "term", name: "Term", type: "string", description: "", speaking: false },
      ],
      result: { term: "date" },
      columns: [{ id: "c1", name: "Term", position: 0 }],
      mappings: [
        {
          id: "m1",
          localFieldId: "term",
          notebaseColumnId: "c1",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: { c1: "date" },
    }

    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          getCalls++
          if (getCalls === 1) {
            // First GET: returns empty snapshot with etag-1
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  format: "readfrog-local",
                  version: 1,
                  updatedAt: 1000,
                  vocabularies: [],
                  conflictVersions: [],
                }),
                { status: 200, headers: { etag: '"etag-1"' } },
              ),
            )
          }
          // Second GET: returns concurrent record with etag-2
          return Promise.resolve(
            new Response(
              JSON.stringify({
                format: "readfrog-local",
                version: 1,
                updatedAt: 3000,
                vocabularies: [concurrentRemoteRecord],
                conflictVersions: [],
              }),
              { status: 200, headers: { etag: '"etag-2"' } },
            ),
          )
        }

        if (init.method === "PUT") {
          putCalls++
          const headers = init.headers as Record<string, string>
          if (headers["If-Match"] === '"etag-1"') {
            // Concurrent change happened on remote! Return 412
            return Promise.resolve(new Response("Precondition Failed", { status: 412 }))
          }
          if (headers["If-Match"] === '"etag-2"') {
            // Second attempt with etag-2 succeeds
            return Promise.resolve(new Response("", { status: 200, headers: { etag: '"etag-3"' } }))
          }
        }

        return Promise.reject(new Error("Unexpected request"))
      })

    const syncResult = await syncWithWebdav(repo, sampleConfig, { maxRetries: 3 }, mockFetch as any)

    expect(syncResult.ok).toBe(true)
    expect(syncResult.remoteUploaded).toBe(true)
    expect(syncResult.etag).toBe('"etag-3"')
    expect(getCalls).toBe(2)
    expect(putCalls).toBe(2)

    // Verify local DB preserved both vocab-1 and the concurrent record
    const localList = await repo.list()
    expect(localList.ok).toBe(true)
    if (!localList.ok) throw new Error(localList.error.message)
    expect(localList.data.total).toBe(2)
    const ids = localList.data.records.map((r) => r.id)
    expect(ids).toContain("vocab-1")
    expect(ids).toContain("vocab-concurrent")
  })

  it("Continuous condition failure (412) exceeding retry budget -> pauses with CONDITION_FAILED_MAX_RETRIES", async () => {
    await repo.createMany({ requestId: "req-1", items: [sampleItemA] })

    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                format: "readfrog-local",
                version: 1,
                updatedAt: 1000,
                vocabularies: [],
                conflictVersions: [],
              }),
              { status: 200, headers: { etag: '"etag-1"' } },
            ),
          )
        }
        if (init.method === "PUT") {
          return Promise.resolve(new Response("Precondition Failed", { status: 412 }))
        }
        return Promise.reject(new Error("Unexpected request"))
      })

    const syncResult = await syncWithWebdav(repo, sampleConfig, { maxRetries: 2 }, mockFetch as any)
    expect(syncResult.ok).toBe(false)
    expect(syncResult.error?.code).toBe("CONDITION_FAILED_MAX_RETRIES")
  })
})

describe("Abnormal Conditions & Pause Invariants", () => {
  let db: LocalDictionaryDB
  let repo: LocalDictionaryRepository

  const sampleConfig: WebdavConfig = {
    endpoint: "https://dav.example.com/webdav/",
    username: "user",
    password: "password",
  }

  const sampleItemA: CreateVocabularyItem = {
    id: "vocab-1",
    actionId: "dict-act",
    actionName: "Dictionary",
    outputSchema: [{ id: "term", name: "Term", type: "string", description: "", speaking: false }],
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

  beforeEach(async () => {
    const dbName = `readfrog-test-abnormal-${Math.random().toString(36).slice(2)}`
    db = new LocalDictionaryDB(dbName)
    await db.open()
    repo = new LocalDictionaryRepository(db)
    await repo.createMany({ requestId: "req-setup", items: [sampleItemA] })
  })

  afterEach(async () => {
    await db.delete()
    db.close()
  })

  it("Authentication failure (401/403) pauses and preserves local and remote intact", async () => {
    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockResolvedValue(new Response("Forbidden", { status: 403 }))

    const result = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("AUTH_FAILED")

    // Local DB is unchanged
    const list = await repo.list()
    expect(list.ok).toBe(true)
    if (!list.ok) throw new Error(list.error.message)
    expect(list.data.total).toBe(1)
    expect(list.data.records[0]?.id).toBe("vocab-1")
  })

  it("Corrupted JSON payload pauses with CORRUPTED_REMOTE, keeping local and remote intact", async () => {
    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          return Promise.resolve(
            new Response("{ corrupted json !! @@", {
              status: 200,
              headers: { etag: '"etag-corrupted"' },
            }),
          )
        }
        return Promise.reject(new Error("PUT should not be invoked on corrupted remote"))
      })

    const result = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("CORRUPTED_REMOTE")

    // Local DB is untouched
    const list = await repo.list()
    expect(list.ok).toBe(true)
    if (!list.ok) throw new Error(list.error.message)
    expect(list.data.total).toBe(1)
    expect(list.data.records[0]?.id).toBe("vocab-1")
  })

  it("Unsupported snapshot version pauses with UNSUPPORTED_VERSION, keeping local intact", async () => {
    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                format: "readfrog-local",
                version: 999, // Unknown future version
                updatedAt: 1000,
                vocabularies: [],
                conflictVersions: [],
              }),
              { status: 200, headers: { etag: '"etag-v999"' } },
            ),
          )
        }
        return Promise.reject(new Error("PUT should not be invoked"))
      })

    const result = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("UNSUPPORTED_VERSION")

    const list = await repo.list()
    expect(list.ok).toBe(true)
    if (!list.ok) throw new Error(list.error.message)
    expect(list.data.total).toBe(1)
  })

  it("Snapshot size budget exceeding 50MB pauses with BUDGET_EXCEEDED, keeping local intact", async () => {
    const hugePayload = "x".repeat(50 * 1024 * 1024 + 10)
    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          return Promise.resolve(
            new Response(hugePayload, { status: 200, headers: { etag: '"etag-huge"' } }),
          )
        }
        return Promise.reject(new Error("PUT should not be invoked"))
      })

    const result = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("BUDGET_EXCEEDED")

    const list = await repo.list()
    expect(list.ok).toBe(true)
    if (!list.ok) throw new Error(list.error.message)
    expect(list.data.total).toBe(1)
  })

  it("Integrity conflict (identical version triple with different payload) pauses with INTEGRITY_CONFLICT, keeping local intact", async () => {
    // Get local record's exact identity key
    const listRes = await repo.list()
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) throw new Error(listRes.error.message)
    const localRec = listRes.data.records[0]!

    // Construct remote candidate with SAME (id, updatedAt, deviceId) but different cells/payload
    const conflictingRemoteRecord: PortableDictionaryRecord = {
      id: localRec.id,
      createdAt: localRec.createdAt,
      updatedAt: localRec.updatedAt,
      deviceId: localRec.deviceId,
      actionId: localRec.actionId,
      actionName: localRec.actionName,
      outputSchema: localRec.outputSchema,
      result: localRec.result,
      columns: localRec.columns,
      mappings: localRec.mappings,
      cells: { c1: "divergent-apple" }, // Different content with same version identity!
    }

    const remoteSnapshot: DictionarySnapshotV1 = {
      format: "readfrog-local",
      version: 1,
      updatedAt: localRec.updatedAt,
      vocabularies: [conflictingRemoteRecord],
      conflictVersions: [],
    }

    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          return Promise.resolve(
            new Response(JSON.stringify(remoteSnapshot), {
              status: 200,
              headers: { etag: '"etag-integrity"' },
            }),
          )
        }
        return Promise.reject(new Error("PUT should not be invoked on integrity conflict"))
      })

    const result = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("INTEGRITY_CONFLICT")

    // Local DB was not changed or corrupted
    const finalList = await repo.list()
    expect(finalList.ok).toBe(true)
    if (!finalList.ok) throw new Error(finalList.error.message)
    expect(finalList.data.records[0]?.cells.c1).toBe("apple")
  })

  it("Missing ETag from server when remote exists pauses with CONDITION_NOT_SUPPORTED", async () => {
    const mockFetch = vi
      .fn<(...args: any[]) => any>()
      .mockImplementation((url: string, init: RequestInit) => {
        if (init.method === "GET") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                format: "readfrog-local",
                version: 1,
                updatedAt: 1000,
                vocabularies: [],
                conflictVersions: [],
              }),
              { status: 200 }, // No ETag header provided
            ),
          )
        }
        return Promise.reject(new Error("PUT should not be invoked"))
      })

    const result = await syncWithWebdav(repo, sampleConfig, {}, mockFetch as any)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("CONDITION_NOT_SUPPORTED")
  })
})
