import type { AddressInfo } from "node:net"
import type { CreateVocabularyItem, DictionarySnapshotV1, WebdavConfig } from "../types"
import http from "node:http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { getLocalDictionaryDb } from "../db"
import { LocalDictionaryRepository } from "../repository"
import { exportDictionarySnapshot } from "../snapshot"
import {
  clearStoredWebdavConfig,
  INITIAL_WEBDAV_SYNC_STATE,
  requestWebdavHostPermission,
  saveStoredWebdavConfig,
  saveStoredWebdavSyncState,
  syncWithWebdav,
  testWebdavConnection,
} from "../webdav"
import "fake-indexeddb/auto"

describe("Issue #15: Release Acceptance Verification", () => {
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

  describe("1. Credential Sanitization & Security Isolation", () => {
    it("never includes WebDAV credentials in exported snapshot payload", async () => {
      const secretPassword = "SuperSecretWebdavPassword!@#123"
      await saveStoredWebdavConfig({
        endpoint: "https://dav.example.com/remote.php/webdav/",
        username: "security_user",
        password: secretPassword,
      })

      const item: CreateVocabularyItem = {
        id: "vocab-sec-1",
        actionId: "dict",
        actionName: "Dictionary",
        outputSchema: [],
        result: {},
        columns: [{ id: "word", name: "Word", position: 0, config: { type: "string" } }],
        mappings: [],
        cells: { word: "toad" },
      }
      await repo.createMany({ requestId: "req-1", items: [item] })

      const snapshotExport = await repo.exportSnapshot()
      expect(snapshotExport.ok).toBe(true)
      if (!snapshotExport.ok) return
      const serialized = snapshotExport.data

      // Ensure credentials never leak into snapshot
      expect(serialized).not.toContain(secretPassword)
      expect(serialized).not.toContain("security_user")
      expect(serialized).not.toContain("Authorization")
      expect(serialized).not.toContain("Basic ")

      // Parse and verify standard snapshot structure
      const parsed: DictionarySnapshotV1 = JSON.parse(serialized)
      expect(parsed.format).toBe("readfrog-local")
      expect(parsed.version).toBe(1)
      expect(parsed.vocabularies).toHaveLength(1)
    })

    it("never leaks raw password or basic auth token in error messages", async () => {
      const secretPassword = "MyUnsafePassword#999"
      const config: WebdavConfig = {
        endpoint: "https://dav.example.com/webdav/",
        username: "testuser",
        password: secretPassword,
      }

      // Mock fetch failure with 401 Unauthorized
      const mockFetch401 = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("Unauthorized", { status: 401 }))
      const res401 = await testWebdavConnection(config, mockFetch401)
      expect(res401.ok).toBe(false)
      expect(res401.error?.message).not.toContain(secretPassword)
      expect(res401.error?.message).not.toContain("Basic ")

      // Mock network exception
      const mockFetchThrow = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("Connection refused to https://dav.example.com/webdav/"))
      const resThrow = await syncWithWebdav(repo, config, undefined, mockFetchThrow)
      expect(resThrow.ok).toBe(false)
      expect(resThrow.error?.message).not.toContain(secretPassword)
      expect(resThrow.error?.message).not.toContain("Basic ")
    })
  })

  describe("2. Host Permission Rejection Graceful Fallback", () => {
    it("preserves local dictionary CRUD and export operations when permission is denied", async () => {
      const originalBrowser = (globalThis as any).browser
      ;(globalThis as any).browser = {
        permissions: {
          request: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
        },
      }

      try {
        const granted = await requestWebdavHostPermission("https://dav.example.com/webdav/")
        expect(granted).toBe(false)

        // Local operations remain fully functional
        const createResult = await repo.createMany({
          requestId: "req-perm-1",
          items: [
            {
              id: "item-perm-1",
              actionId: "dict",
              actionName: "Dict",
              outputSchema: [],
              result: {},
              columns: [{ id: "term", name: "Term", position: 0, config: { type: "string" } }],
              mappings: [],
              cells: { term: "permission-fallback" },
            },
          ],
        })
        expect(createResult.ok).toBe(true)

        const listResult = await repo.list({})
        expect(listResult.ok).toBe(true)
        if (!listResult.ok) return
        const firstRecord = listResult.data.records[0]
        expect(firstRecord).toBeDefined()
        if (!firstRecord) return
        expect(firstRecord.cells.term).toBe("permission-fallback")

        const updateResult = await repo.updateCells({
          requestId: "req-perm-2",
          id: "item-perm-1",
          expectedRevision: firstRecord.localRevision,
          cells: { term: "permission-updated" },
        })
        expect(updateResult.ok).toBe(true)

        const exportResult = await repo.exportSnapshot()
        expect(exportResult.ok).toBe(true)
      } finally {
        ;(globalThis as any).browser = originalBrowser
      }
    })
  })

  describe("3. Controllable WebDAV Integration: ETag & 412 Reconciliation", () => {
    it("handles initial upload race (If-None-Match: * returning 412) and reconciles in next attempt", async () => {
      const config: WebdavConfig = {
        endpoint: "https://dav.example.com/webdav/",
        username: "user",
        password: "pass",
      }

      await repo.createMany({
        requestId: "seed-local",
        items: [
          {
            id: "local-only",
            actionId: "act",
            actionName: "act",
            outputSchema: [],
            result: {},
            columns: [{ id: "w", name: "W", position: 0, config: { type: "string" } }],
            mappings: [],
            cells: { w: "frog" },
          },
        ],
      })

      let getCount = 0
      let putCount = 0
      const putHeadersList: any[] = []

      // Simulate:
      // Attempt 1:
      //  GET returns 404 (file does not exist)
      //  PUT sends If-None-Match: * -> returns 412 (another client created file first)
      // Attempt 2:
      //  GET returns 200 with remote file created by the other client (ETag: "remote-etag-1")
      //  PUT sends If-Match: "remote-etag-1" -> returns 200 with new ETag "remote-etag-2"
      const mockFetch = vi.fn<typeof fetch>().mockImplementation((url, init) => {
        if (init?.method === "GET") {
          getCount++
          if (getCount === 1) {
            return Promise.resolve(new Response("Not Found", { status: 404 }))
          }
          const remoteContent = exportDictionarySnapshot(
            [
              {
                id: "remote-peer",
                actionId: "act",
                actionName: "act",
                outputSchema: [],
                result: {},
                columns: [{ id: "w", name: "W", position: 0, config: { type: "string" } }],
                mappings: [],
                cells: { w: "toad" },
                createdAt: 1000,
                updatedAt: 1000,
                deletedAt: null,
                deviceId: "peer-device",
              },
            ],
            [],
          )
          return Promise.resolve(
            new Response(remoteContent, {
              status: 200,
              headers: { etag: '"remote-etag-1"' },
            }),
          )
        }

        if (init?.method === "PUT") {
          putCount++
          putHeadersList.push(init.headers)
          if (putCount === 1) {
            // First PUT attempt returns 412 Precondition Failed
            return Promise.resolve(new Response("Precondition Failed", { status: 412 }))
          }
          // Second PUT succeeds
          return Promise.resolve(
            new Response("", {
              status: 200,
              headers: { etag: '"remote-etag-2"' },
            }),
          )
        }

        return Promise.resolve(new Response("", { status: 400 }))
      })

      const syncResult = await syncWithWebdav(repo, config, undefined, mockFetch)

      expect(syncResult.ok).toBe(true)
      expect(getCount).toBe(2)
      expect(putCount).toBe(2)

      // First attempt had If-None-Match: *
      expect(putHeadersList[0]?.["If-None-Match"]).toBe("*")
      // Second attempt had If-Match: "remote-etag-1"
      expect(putHeadersList[1]?.["If-Match"]).toBe('"remote-etag-1"')

      // Verify local database now contains both records
      const listRes = await repo.list({})
      expect(listRes.ok).toBe(true)
      if (!listRes.ok) return
      expect(listRes.data.records).toHaveLength(2)
      const words = listRes.data.records
        .map((r: any) => String(r.cells.w))
        .sort((a, b) => a.localeCompare(b))
      expect(words).toEqual(["frog", "toad"])
    })

    it("stops and reports CONDITION_FAILED_MAX_RETRIES when concurrent changes repeatedly exceed maxRetries", async () => {
      const config: WebdavConfig = {
        endpoint: "https://dav.example.com/webdav/",
        username: "user",
        password: "pass",
      }

      await repo.createMany({
        requestId: "seed-1",
        items: [
          {
            id: "i1",
            actionId: "act",
            actionName: "act",
            outputSchema: [],
            result: {},
            columns: [{ id: "w", name: "W", position: 0, config: { type: "string" } }],
            mappings: [],
            cells: { w: "local" },
          },
        ],
      })

      // Every PUT returns 412
      const mockFetch = vi.fn<typeof fetch>().mockImplementation((url, init) => {
        if (init?.method === "GET") {
          return Promise.resolve(new Response("Not Found", { status: 404 }))
        }
        if (init?.method === "PUT") {
          return Promise.resolve(new Response("Precondition Failed", { status: 412 }))
        }
        return Promise.resolve(new Response("", { status: 400 }))
      })

      const result = await syncWithWebdav(repo, config, { maxRetries: 3 }, mockFetch)
      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe("CONDITION_FAILED_MAX_RETRIES")
      expect(mockFetch).toHaveBeenCalledTimes(6) // 3 attempts * (GET + PUT)

      // Local records are still preserved
      const records = await repo.list({})
      expect(records.ok).toBe(true)
      if (!records.ok) return
      expect(records.data.records).toHaveLength(1)
    })
  })

  describe("4. Remote Anomalies: Safe Pause Behavior", () => {
    it("pauses on corrupted JSON from remote server without crashing or wiping local DB", async () => {
      const config: WebdavConfig = {
        endpoint: "https://dav.example.com/webdav/",
        username: "user",
        password: "pass",
      }

      await repo.createMany({
        requestId: "seed-corrupt",
        items: [
          {
            id: "keep-safe",
            actionId: "act",
            actionName: "act",
            outputSchema: [],
            result: {},
            columns: [{ id: "w", name: "W", position: 0, config: { type: "string" } }],
            mappings: [],
            cells: { w: "safe-word" },
          },
        ],
      })

      const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 200,
          headers: { etag: '"corrupt-etag"' },
        }),
      )

      const result = await syncWithWebdav(repo, config, undefined, mockFetch)
      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe("CORRUPTED_REMOTE")
      expect(result.error?.retryable).toBe(false)

      // Local records must remain untouched
      const after = await repo.list({})
      expect(after.ok).toBe(true)
      if (!after.ok) return
      expect(after.data.records).toHaveLength(1)
      const firstAfter = after.data.records[0]
      expect(firstAfter).toBeDefined()
      if (!firstAfter) return
      expect(firstAfter.cells.w).toBe("safe-word")
    })

    it("pauses when remote snapshot version is unsupported", async () => {
      const config: WebdavConfig = {
        endpoint: "https://dav.example.com/webdav/",
        username: "user",
        password: "pass",
      }

      const futureSnapshot = JSON.stringify({
        format: "readfrog-local",
        version: 999, // future version
        updatedAt: Date.now(),
        vocabularies: [],
        conflictVersions: [],
      })

      const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(futureSnapshot, {
          status: 200,
          headers: { etag: '"future-etag"' },
        }),
      )

      const result = await syncWithWebdav(repo, config, undefined, mockFetch)
      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe("UNSUPPORTED_VERSION")
      expect(result.error?.retryable).toBe(false)
    })
  })

  describe("5. Controllable WebDAV HTTP Server Harness (Real TCP Wire)", () => {
    let server: http.Server
    let serverUrl: string
    let remoteFileContent: string | null = null
    let remoteEtag = '"real-etag-v1"'

    beforeEach(async () => {
      remoteFileContent = null
      remoteEtag = '"real-etag-v1"'

      server = http.createServer((req, res) => {
        const url = new URL(req.url || "/", `http://${req.headers.host}`)
        if (url.pathname !== "/readbuddy.json") {
          res.writeHead(404)
          res.end("Not Found")
          return
        }

        if (req.method === "GET") {
          if (!remoteFileContent) {
            res.writeHead(404)
            res.end("Not Found")
            return
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            ETag: remoteEtag,
          })
          res.end(remoteFileContent)
          return
        }

        if (req.method === "PUT") {
          const ifNoneMatch = req.headers["if-none-match"]
          const ifMatch = req.headers["if-match"]

          // Conditional validation
          if (ifNoneMatch === "*" && remoteFileContent) {
            res.writeHead(412, "Precondition Failed")
            res.end("Already exists")
            return
          }
          if (ifMatch && ifMatch !== remoteEtag) {
            res.writeHead(412, "Precondition Failed")
            res.end("ETag mismatch")
            return
          }

          let body = ""
          req.on("data", (chunk) => {
            body += chunk
          })
          req.on("end", () => {
            remoteFileContent = body
            remoteEtag = '"real-etag-v2"'
            res.writeHead(201, {
              ETag: remoteEtag,
            })
            res.end("Created")
          })
          return
        }

        res.writeHead(405)
        res.end("Method Not Allowed")
      })

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve())
      })
      const addr = server.address() as AddressInfo
      serverUrl = `http://127.0.0.1:${addr.port}/`
    })

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    })

    it("successfully completes first sync and conditional update over real HTTP TCP wire", async () => {
      const config: WebdavConfig = {
        endpoint: serverUrl,
        username: "testuser",
        password: "testpassword",
      }

      await repo.createMany({
        requestId: "req-wire-1",
        items: [
          {
            id: "vocab-wire-1",
            actionId: "act",
            actionName: "act",
            outputSchema: [],
            result: {},
            columns: [{ id: "term", name: "Term", position: 0, config: { type: "string" } }],
            mappings: [],
            cells: { term: "real-network-wire" },
          },
        ],
      })

      // Sync 1: Initial upload with If-None-Match: * over real HTTP socket
      const syncResult1 = await syncWithWebdav(repo, config)
      expect(syncResult1.ok).toBe(true)
      expect(syncResult1.etag).toBe('"real-etag-v2"')
      expect(remoteFileContent).not.toBeNull()
      expect(remoteFileContent).toContain("real-network-wire")

      // Sync 2: Secondary pass when remote and local are in sync (no upload needed)
      const syncResult2 = await syncWithWebdav(repo, config)
      expect(syncResult2.ok).toBe(true)
      expect(syncResult2.remoteUploaded).toBe(false)
    })
  })
})
