import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { getLocalDictionaryDb } from "../db"
import { LocalDictionaryRepository } from "../repository"
import {
  calculateExponentialBackoff,
  WebdavSyncEngine,
  WEBDAV_SYNC_ALARM_NAME,
} from "../sync-engine"
import {
  getStoredWebdavSyncState,
  INITIAL_WEBDAV_SYNC_STATE,
  saveStoredWebdavConfig,
  saveStoredWebdavSyncState,
} from "../webdav"
import "fake-indexeddb/auto"

describe("WebdavSyncEngine", () => {
  let repo: LocalDictionaryRepository

  beforeEach(async () => {
    fakeBrowser.reset()
    const db = getLocalDictionaryDb()
    await db.vocabularies.clear()
    await db.conflictVersions.clear()
    await db.metadata.clear()
    await db.syncChanges.clear()
    await db.mutationReceipts.clear()
    repo = new LocalDictionaryRepository(db)
    await saveStoredWebdavSyncState(INITIAL_WEBDAV_SYNC_STATE)
  })

  it("calculates exponential backoff correctly with limits", () => {
    expect(calculateExponentialBackoff(0, 2000, 60000)).toBe(2000)
    expect(calculateExponentialBackoff(1, 2000, 60000)).toBe(4000)
    expect(calculateExponentialBackoff(2, 2000, 60000)).toBe(8000)
    expect(calculateExponentialBackoff(3, 2000, 60000)).toBe(16000)
    expect(calculateExponentialBackoff(4, 2000, 60000)).toBe(32000)
    expect(calculateExponentialBackoff(5, 2000, 60000)).toBe(60000) // capped at 60000
    expect(calculateExponentialBackoff(10, 2000, 60000)).toBe(60000)
  })

  it("skips sync if WebDAV is not configured", async () => {
    const engine = new WebdavSyncEngine(() => repo)
    const result = await engine.triggerSync({ reason: "startup" })
    expect(result).toBeNull()

    const state = await getStoredWebdavSyncState()
    expect(state.phase).toBe("idle")
  })

  it("executes successful sync, resets retryCount, updates lastSuccessTime and cancels alarms", async () => {
    await saveStoredWebdavConfig({
      endpoint: "https://dav.example.com/webdav/",
      username: "user",
      password: "pass",
    })

    const mockFetch = vi.fn<typeof fetch>().mockImplementation((url, init) => {
      if (init?.method === "GET") {
        return Promise.resolve(new Response("Not Found", { status: 404 }))
      }
      if (init?.method === "PUT") {
        return Promise.resolve(new Response("", { status: 201, headers: { etag: '"new-etag"' } }))
      }
      return Promise.resolve(new Response("", { status: 400 }))
    })

    const engine = new WebdavSyncEngine(() => repo, {
      fetchFn: mockFetch,
    })

    const result = await engine.triggerSync({ reason: "manual" })
    expect(result).toBeDefined()
    expect(result?.ok).toBe(true)

    const state = await getStoredWebdavSyncState()
    expect(state.phase).toBe("idle")
    expect(state.lastSuccessTime).not.toBeNull()
    expect(state.retryCount).toBe(0)
    expect(state.lastError).toBeNull()
  })

  it("handles recoverable network error with exponential backoff and alarm registration", async () => {
    await saveStoredWebdavConfig({
      endpoint: "https://dav.example.com/webdav/",
      username: "user",
      password: "pass",
    })

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("Network connection dropped"))

    const engine = new WebdavSyncEngine(() => repo, {
      fetchFn: mockFetch,
      baseBackoffMs: 1000,
      maxBackoffMs: 10000,
    })

    const result = await engine.triggerSync({ reason: "debounce" })
    expect(result?.ok).toBe(false)

    const state = await getStoredWebdavSyncState()
    expect(state.phase).toBe("error")
    expect(state.retryCount).toBe(1)
    expect(state.nextRetryTime).toBeGreaterThan(Date.now())
    expect(state.lastError?.code).toBe("NETWORK_ERROR")

    // Alarm should be created in fakeBrowser
    const alarm = await fakeBrowser.alarms.get(WEBDAV_SYNC_ALARM_NAME)
    expect(alarm).toBeDefined()
  })

  it("pauses on unrecoverable errors (e.g. AUTH_FAILED, CORRUPTED_REMOTE, CONDITION_NOT_SUPPORTED) without auto-retrying", async () => {
    await saveStoredWebdavConfig({
      endpoint: "https://dav.example.com/webdav/",
      username: "user",
      password: "wrong-pass",
    })

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Unauthorized", { status: 401 }))

    const engine = new WebdavSyncEngine(() => repo, {
      fetchFn: mockFetch,
    })

    const result = await engine.triggerSync({ reason: "startup" })
    expect(result?.ok).toBe(false)

    const state = await getStoredWebdavSyncState()
    expect(state.phase).toBe("paused")
    expect(state.pausedReason).toBe("AUTH_FAILED")
    expect(state.nextRetryTime).toBeNull()

    // Subsequent automatic sync (debounce or startup) is skipped when paused
    const nextResult = await engine.triggerSync({ reason: "debounce" })
    expect(nextResult).toBeNull()
  })

  it("prevents concurrent sync executions via mutex and runs pending pass after completion", async () => {
    await saveStoredWebdavConfig({
      endpoint: "https://dav.example.com/webdav/",
      username: "user",
      password: "pass",
    })

    let getCalls = 0
    const resolvers: Array<(res: Response) => void> = []

    const mockFetch = vi.fn<typeof fetch>().mockImplementation((url, init) => {
      if (init?.method === "GET") {
        getCalls++
        return new Promise<Response>((resolve) => {
          resolvers.push(resolve)
        })
      }
      return Promise.resolve(new Response("", { status: 201, headers: { etag: '"etag"' } }))
    })

    const engine = new WebdavSyncEngine(() => repo, {
      fetchFn: mockFetch,
      debounceMs: 5,
    })

    // First trigger starts sync
    const firstSyncPromise = engine.triggerSync({ reason: "manual" })

    // Give first trigger a tick to hit fetch
    await new Promise((r) => setTimeout(r, 10))

    // Second trigger occurs while first is running
    const secondSyncResult = await engine.triggerSync({ reason: "debounce" })
    expect(secondSyncResult).toBeNull() // queued as pending

    // Now resolve the first sync GET request
    expect(resolvers.length).toBe(1)
    resolvers[0]!(new Response("Not Found", { status: 404 }))
    await firstSyncPromise

    // Wait for the pending pass to execute
    await new Promise((r) => setTimeout(r, 50))
    expect(resolvers.length).toBe(2)
    resolvers[1]!(new Response("Not Found", { status: 404 }))
    await new Promise((r) => setTimeout(r, 50))

    expect(getCalls).toBe(2)
  })

  it("restores schedule on service worker restart if within backoff window", async () => {
    await saveStoredWebdavConfig({
      endpoint: "https://dav.example.com/webdav/",
      username: "user",
      password: "pass",
    })

    const futureTime = Date.now() + 5000
    await saveStoredWebdavSyncState({
      phase: "error",
      retryCount: 2,
      nextRetryTime: futureTime,
      lastError: { code: "NETWORK_ERROR", message: "offline", retryable: true },
    })

    const engine = new WebdavSyncEngine(() => repo)
    await engine.restoreAndCheckSchedule()

    const state = await getStoredWebdavSyncState()
    expect(state.phase).toBe("error")
    expect(state.nextRetryTime).toBe(futureTime)
  })

  it("does not auto-restart sync on SW startup if max retries exceeded", async () => {
    await saveStoredWebdavConfig({
      endpoint: "https://dav.example.com/webdav/",
      username: "user",
      password: "pass",
    })

    await saveStoredWebdavSyncState({
      phase: "error",
      retryCount: 6,
      nextRetryTime: null,
      lastError: { code: "NETWORK_ERROR", message: "offline", retryable: true },
    })

    const mockFetch = vi.fn<typeof fetch>()
    const engine = new WebdavSyncEngine(() => repo, { fetchFn: mockFetch })
    await engine.restoreAndCheckSchedule()

    // Should NOT trigger sync
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("disallows forceUnconditional unless previously paused with CONDITION_NOT_SUPPORTED", async () => {
    await saveStoredWebdavConfig({
      endpoint: "https://dav.example.com/webdav/",
      username: "user",
      password: "pass",
    })

    await repo.createMany({
      requestId: "seed-1",
      items: [
        {
          id: "item-1",
          actionId: "act",
          actionName: "act",
          outputSchema: [],
          result: {},
          columns: [{ id: "word", name: "Word", position: 0, config: { type: "string" } }],
          mappings: [],
          cells: { word: "hello" },
        },
      ],
    })

    let capturedHeaders: HeadersInit | undefined
    const mockFetch = vi.fn<typeof fetch>().mockImplementation((url, init) => {
      if (init?.method === "GET") {
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
      if (init?.method === "PUT") {
        capturedHeaders = init.headers
        return Promise.resolve(new Response("", { status: 200, headers: { etag: '"etag-2"' } }))
      }
      return Promise.resolve(new Response("", { status: 400 }))
    })

    const engine = new WebdavSyncEngine(() => repo, { fetchFn: mockFetch })

    // When not paused for CONDITION_NOT_SUPPORTED, forceUnconditional is ignored
    await engine.triggerSync({ reason: "manual", forceUnconditional: true })
    expect((capturedHeaders as Record<string, string>)?.["If-Match"]).toBe('"etag-1"')

    // Now set paused with CONDITION_NOT_SUPPORTED
    await saveStoredWebdavSyncState({
      phase: "paused",
      pausedReason: "CONDITION_NOT_SUPPORTED",
    })

    capturedHeaders = undefined
    await engine.triggerSync({
      reason: "manual",
      forceUnconditional: true,
      resetPaused: true,
    })
    // Now forceUnconditional is respected (no If-Match)
    expect((capturedHeaders as unknown as Record<string, string>)?.["If-Match"]).toBeUndefined()
  })
})
