import type { WebdavConfig } from "../types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { getLocalDictionaryDb } from "../db"
import { LocalDictionaryRepository } from "../repository"
import {
  clearStoredWebdavConfig,
  INITIAL_WEBDAV_SYNC_STATE,
  normalizeWebdavEndpoint,
  saveStoredWebdavSyncState,
  syncWithWebdav,
} from "../webdav"
import "fake-indexeddb/auto"

describe("Diagnosing Bug: Jianguoyun 404 ObjectNotFound on upload", () => {
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
    await clearStoredWebdavConfig()
    await saveStoredWebdavSyncState(INITIAL_WEBDAV_SYNC_STATE)
  })

  it("auto-normalizes Jianguoyun root endpoint to include /readbuddy/ directory", () => {
    expect(normalizeWebdavEndpoint("https://dav.jianguoyun.com/dav/")).toBe(
      "https://dav.jianguoyun.com/dav/readbuddy/",
    )
    expect(normalizeWebdavEndpoint("https://dav.jianguoyun.com/dav")).toBe(
      "https://dav.jianguoyun.com/dav/readbuddy/",
    )
    expect(normalizeWebdavEndpoint("https://dav.jianguoyun.com/dav/custom-folder/")).toBe(
      "https://dav.jianguoyun.com/dav/custom-folder/",
    )
  })

  it("automatically creates parent collection via MKCOL when PUT returns 404 or 409", async () => {
    const config: WebdavConfig = {
      endpoint: "https://dav.jianguoyun.com/dav/",
      username: "test@example.com",
      password: "<REDACTED>",
    }

    await repo.createMany({
      requestId: "req-1",
      items: [
        {
          id: "item-1",
          actionId: "act",
          actionName: "act",
          outputSchema: [],
          result: {},
          columns: [{ id: "term", name: "Term", position: 0, config: { type: "string" } }],
          mappings: [],
          cells: { term: "toad" },
        },
      ],
    })

    const jianguoyun404Body = `
<d:error xmlns:d="DAV:" xmlns:s="http://ns.jianguoyun.com">
<s:exception>ObjectNotFound</s:exception>
<s:message>The resource of this location does not exist</s:message>
</d:error>
`.trim()

    let mkcolCalled = false
    let mkcolUrl = ""
    let putAttempt = 0

    const mockFetch = vi.fn<typeof fetch>().mockImplementation((url, init) => {
      const urlStr = typeof url === "string" ? url : "href" in url ? url.href : url.url
      if (init?.method === "GET") {
        return Promise.resolve(new Response("Not Found", { status: 404 }))
      }
      if (init?.method === "MKCOL") {
        mkcolCalled = true
        mkcolUrl = urlStr
        // MKCOL on collection returns 201 Created
        return Promise.resolve(new Response("Created", { status: 201 }))
      }
      if (init?.method === "PUT") {
        putAttempt++
        if (putAttempt === 1) {
          // First PUT attempt returns 404 ObjectNotFound because folder didn't exist yet
          return Promise.resolve(
            new Response(jianguoyun404Body, {
              status: 404,
              headers: { "Content-Type": "application/xml" },
            }),
          )
        }
        // Second PUT attempt after MKCOL succeeds
        return Promise.resolve(new Response("", { status: 201, headers: { etag: '"new-etag"' } }))
      }
      return Promise.resolve(new Response("", { status: 400 }))
    })

    const result = await syncWithWebdav(repo, config, undefined, mockFetch)

    expect(result.ok).toBe(true)
    expect(mkcolCalled).toBe(true)
    expect(mkcolUrl).toBe("https://dav.jianguoyun.com/dav/readbuddy/")
    expect(result.etag).toBe('"new-etag"')
  })

  it("reports actionable non-retryable error when server permanently rejects with 404 ObjectNotFound", async () => {
    const config: WebdavConfig = {
      endpoint: "https://dav.jianguoyun.com/dav/",
      username: "test@example.com",
      password: "<REDACTED>",
    }

    await repo.createMany({
      requestId: "req-fail",
      items: [
        {
          id: "item-1",
          actionId: "act",
          actionName: "act",
          outputSchema: [],
          result: {},
          columns: [{ id: "term", name: "Term", position: 0, config: { type: "string" } }],
          mappings: [],
          cells: { term: "toad" },
        },
      ],
    })

    const jianguoyun404Body = `
<d:error xmlns:d="DAV:" xmlns:s="http://ns.jianguoyun.com">
<s:exception>ObjectNotFound</s:exception>
<s:message>The resource of this location does not exist</s:message>
</d:error>
`.trim()

    const mockFetch = vi.fn<typeof fetch>().mockImplementation((url, init) => {
      if (init?.method === "GET") {
        return Promise.resolve(new Response("Not Found", { status: 404 }))
      }
      if (init?.method === "MKCOL") {
        // MKCOL also forbidden or failing
        return Promise.resolve(new Response("Forbidden", { status: 403 }))
      }
      if (init?.method === "PUT") {
        return Promise.resolve(
          new Response(jianguoyun404Body, {
            status: 404,
            headers: { "Content-Type": "application/xml" },
          }),
        )
      }
      return Promise.resolve(new Response("", { status: 400 }))
    })

    const result = await syncWithWebdav(repo, config, undefined, mockFetch)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("NETWORK_ERROR")
    expect(result.error?.retryable).toBe(false)
    expect(result.error?.message).toContain("坚果云根目录不支持直接放置文件")
  })
})
