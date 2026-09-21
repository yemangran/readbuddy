import type { CreateVocabularyItem, WebdavConfig } from "../types"
import type { Config } from "@/types/config/config"
import type { ReviewState } from "@/utils/review/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { getAllBackupsWithMetadata } from "@/utils/backup/storage"
import { CONFIG_SCHEMA_VERSION, CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { createReviewStore, type ReviewStorageDriver } from "@/utils/review/store"
import { LocalDictionaryDB } from "../db"
import { LocalDictionaryRepository } from "../repository"
import { WebdavSyncEngine } from "../sync-engine"
import {
  getStoredWebdavSyncState,
  INITIAL_WEBDAV_SYNC_STATE,
  saveStoredWebdavConfig,
  saveStoredWebdavSyncState,
  syncWithWebdav,
} from "../webdav"
import "fake-indexeddb/auto"

const ENDPOINT = "https://dav.example.com/webdav/"
const DICTIONARY_URL = `${ENDPOINT}readbuddy.json`
const REVIEWS_URL = `${ENDPOINT}readbuddy-reviews.json`
const CONFIG_URL = `${ENDPOINT}readbuddy-config.json`

const sampleConfig: WebdavConfig = {
  endpoint: ENDPOINT,
  username: "testuser",
  password: "secretpassword123",
}

interface StoredFile {
  body: string
  etag: string
}

interface RecordedRequest {
  method: string
  url: string
  headers: Record<string, string>
}

/** Fetch inputs arrive as a string, a URL, or a Request depending on the caller. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * Minimal in-memory WebDAV server over the three sync files, with ETag
 * conditional PUT — the same contract the dictionary and config modules rely on.
 */
function createMockWebdavServer() {
  const files = new Map<string, StoredFile>()
  const requests: RecordedRequest[] = []
  let etagCounter = 0

  const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async (input, init) => {
      const url = requestUrl(input)
      const headers = (init?.headers ?? {}) as Record<string, string>
      const method = init?.method ?? "GET"
      requests.push({ method, url, headers })

      if (method === "GET") {
        const file = files.get(url)
        if (!file) {
          return new Response("Not Found", { status: 404 })
        }
        // Encode explicitly: the shared vitest setup replaces TextEncoder with a
        // UTF-16-code-unit variant that corrupts multi-byte characters.
        return new Response(Buffer.from(file.body, "utf-8"), {
          status: 200,
          headers: { etag: file.etag },
        })
      }

      if (method === "PUT") {
        const existing = files.get(url)
        if (headers["If-None-Match"] === "*" && existing) {
          return new Response("Precondition Failed", { status: 412 })
        }
        if (headers["If-Match"] && existing && headers["If-Match"] !== existing.etag) {
          return new Response("Precondition Failed", { status: 412 })
        }
        etagCounter += 1
        const etag = `"etag-${etagCounter}"`
        files.set(url, { body: typeof init?.body === "string" ? init.body : "", etag })
        return new Response(null, { status: existing ? 204 : 201, headers: { etag } })
      }

      return new Response("Method Not Allowed", { status: 405 })
    },
  )

  return {
    files,
    requests,
    fetchFn: fetchFn as unknown as typeof fetch,
    /** Installs a remote file directly, as another device would have written it. */
    put(url: string, body: string) {
      etagCounter += 1
      files.set(url, { body, etag: `"etag-${etagCounter}"` })
    },
    read(url: string): string {
      const file = files.get(url)
      if (!file) throw new Error(`No remote file at ${url}`)
      return file.body
    },
    requestMethods(url: string) {
      return requests.filter((request) => request.url === url).map((request) => request.method)
    },
  }
}

function buildConfig(overrides: Partial<Config> = {}): Config {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides }
}

function buildRemoteConfigSnapshot(config: Config, updatedAt: number): string {
  return JSON.stringify(
    {
      format: "readbuddy-config",
      version: 1,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      updatedAt,
      config,
    },
    null,
    2,
  )
}

function buildVocabItem(id: string, term: string): CreateVocabularyItem {
  return {
    id,
    actionId: "dict",
    actionName: "Dictionary",
    outputSchema: [],
    result: {},
    columns: [{ id: "c1", name: "Word", position: 0 }],
    mappings: [],
    cells: { c1: term },
  }
}

function buildReviewState(recordId: string): ReviewState {
  return {
    recordId,
    state: "learning",
    due: 2000,
    stability: 1.5,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 1,
    lapses: 0,
    lastReview: 1000,
  }
}

async function seedLocalConfig(config: Config, lastModifiedAt: number) {
  await storage.setItem<Config>(`local:${CONFIG_STORAGE_KEY}`, config)
  await storage.setMeta(`local:${CONFIG_STORAGE_KEY}`, {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    lastModifiedAt,
  })
}

async function readLocalConfig(): Promise<Config> {
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  if (!config) throw new Error("No local config in storage")
  return config
}

function createSeededReviewStore() {
  const states: Record<string, ReviewState> = {}
  const driver: ReviewStorageDriver = {
    getStates: async () => ({ ...states }),
    saveStates: async (next) => {
      for (const [key, value] of Object.entries(next)) {
        states[key] = value
      }
    },
  }
  return createReviewStore(driver)
}

describe("Unified WebDAV sync: dictionary, review states, and preferences", () => {
  let db: LocalDictionaryDB
  let repo: LocalDictionaryRepository
  let server: ReturnType<typeof createMockWebdavServer>
  let reviewStoreInstance: ReturnType<typeof createReviewStore>

  beforeEach(async () => {
    server = createMockWebdavServer()
    await storage.removeItem(`local:${CONFIG_STORAGE_KEY}`, { removeMeta: true })
    await storage.removeItem("local:backup_ids")

    const dbName = `readfrog-unified-sync-test-${Math.random().toString(36).slice(2)}`
    db = new LocalDictionaryDB(dbName)
    await db.open()
    repo = new LocalDictionaryRepository(db)
    reviewStoreInstance = createSeededReviewStore()
  })

  afterEach(async () => {
    await storage.removeItem(`local:${CONFIG_STORAGE_KEY}`, { removeMeta: true })
    await storage.removeItem("local:backup_ids")
    await db.delete()
    db.close()
  })

  it("uploads the dictionary, review states, and preferences in a single sync pass", async () => {
    const localConfig = buildConfig({ uiLanguage: "zh-CN" })
    await seedLocalConfig(localConfig, 1_700_000_000_000)
    await repo.createMany({
      requestId: "req-1",
      items: [buildVocabItem("unified-vocab-1", "ephemeral")],
    })
    await reviewStoreInstance.saveAllStates({
      "unified-vocab-1": buildReviewState("unified-vocab-1"),
    })

    const result = await syncWithWebdav(
      repo,
      sampleConfig,
      { syncReviews: true, reviewStoreInstance },
      server.fetchFn,
    )

    expect(result.ok).toBe(true)
    expect(result.remoteUploaded).toBe(true)

    // Every component reports its own outcome of the same pass
    expect(result.components?.dictionary).toMatchObject({ ok: true, remoteUploaded: true })
    expect(result.components?.reviews).toMatchObject({ ok: true, remoteUploaded: true })
    expect(result.components?.config).toEqual({ ok: true, action: "uploaded" })

    // The three canonical files now sit side by side on the server
    expect(server.requestMethods(DICTIONARY_URL)).toEqual(["GET", "PUT"])
    expect(server.requestMethods(REVIEWS_URL)).toEqual(["GET", "PUT"])
    expect(server.requestMethods(CONFIG_URL)).toEqual(["GET", "PUT"])
    expect(server.read(DICTIONARY_URL)).toContain("unified-vocab-1")
    expect(server.read(REVIEWS_URL)).toContain("unified-vocab-1")

    const remoteConfig = JSON.parse(server.read(CONFIG_URL))
    expect(remoteConfig).toMatchObject({
      format: "readbuddy-config",
      version: 1,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      updatedAt: 1_700_000_000_000,
      config: localConfig,
    })
  })

  it("applies the newer remote preferences while still syncing the dictionary and review states", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    const remoteConfig = buildConfig({ uiLanguage: "zh-CN" })
    await seedLocalConfig(localConfig, 1_000)
    server.put(CONFIG_URL, buildRemoteConfigSnapshot(remoteConfig, 5_000))
    await repo.createMany({
      requestId: "req-2",
      items: [buildVocabItem("unified-vocab-2", "transient")],
    })
    await reviewStoreInstance.saveAllStates({
      "unified-vocab-2": buildReviewState("unified-vocab-2"),
    })

    const result = await syncWithWebdav(
      repo,
      sampleConfig,
      { syncReviews: true, reviewStoreInstance },
      server.fetchFn,
    )

    expect(result.ok).toBe(true)
    expect(result.components?.config).toEqual({
      ok: true,
      action: "downloaded",
      backupCreated: true,
    })

    // The remote config replaced the local one, and the overwritten config stays
    // recoverable from the local backup history
    expect(await readLocalConfig()).toEqual(remoteConfig)
    const backups = await getAllBackupsWithMetadata()
    expect(backups).toHaveLength(1)
    expect(backups[0]!.config).toEqual(localConfig)

    // The winning remote config is not re-uploaded, while the other components sync
    expect(server.requestMethods(CONFIG_URL)).toEqual(["GET"])
    expect(server.read(DICTIONARY_URL)).toContain("unified-vocab-2")
    expect(server.read(REVIEWS_URL)).toContain("unified-vocab-2")
  })

  it("uploads the newer local preferences over the older remote ones, guarded by their ETag", async () => {
    const localConfig = buildConfig({ uiLanguage: "es" })
    const remoteConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 9_000)
    server.put(CONFIG_URL, buildRemoteConfigSnapshot(remoteConfig, 1_000))
    await repo.createMany({
      requestId: "req-5",
      items: [buildVocabItem("unified-vocab-5", "evanescent")],
    })

    const result = await syncWithWebdav(
      repo,
      sampleConfig,
      { syncReviews: true, reviewStoreInstance },
      server.fetchFn,
    )

    expect(result.ok).toBe(true)
    expect(result.components?.config).toEqual({ ok: true, action: "uploaded" })

    // The upload overwrites the older remote file, but only under the ETag of
    // the file this pass just read
    const configPuts = server.requests.filter(
      (request) => request.url === CONFIG_URL && request.method === "PUT",
    )
    expect(configPuts).toHaveLength(1)
    expect(configPuts[0]!.headers["If-Match"]).toBe('"etag-1"')
    expect(JSON.parse(server.read(CONFIG_URL)).config).toEqual(localConfig)
    // Local preferences are untouched by an upload, and nothing is backed up
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
  })

  it("reconciles every component again on a second pass without re-uploading", async () => {
    const localConfig = buildConfig({ uiLanguage: "zh-CN" })
    await seedLocalConfig(localConfig, 5_000)
    await repo.createMany({
      requestId: "req-6",
      items: [buildVocabItem("unified-vocab-6", "vanishing")],
    })
    await reviewStoreInstance.saveAllStates({
      "unified-vocab-6": buildReviewState("unified-vocab-6"),
    })

    const first = await syncWithWebdav(
      repo,
      sampleConfig,
      { syncReviews: true, reviewStoreInstance },
      server.fetchFn,
    )
    expect(first.ok).toBe(true)
    expect(first.remoteUploaded).toBe(true)
    const remoteStateAfterFirstPass = new Map(
      [...server.files.entries()].map(([url, file]) => [url, file.etag]),
    )

    const second = await syncWithWebdav(
      repo,
      sampleConfig,
      { syncReviews: true, reviewStoreInstance },
      server.fetchFn,
    )

    // Both sides now agree on all three files: nothing is uploaded again
    expect(second.ok).toBe(true)
    expect(second.remoteUploaded).toBe(false)
    expect(second.components?.config).toEqual({ ok: true, action: "no-change" })
    expect(second.components?.reviews).toMatchObject({ ok: true, remoteUploaded: false })
    for (const [url, etag] of remoteStateAfterFirstPass) {
      expect(server.files.get(url)?.etag).toBe(etag)
    }
  })

  it("keeps syncing the dictionary and review states when the preferences cannot be read", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 1_000)
    server.put(CONFIG_URL, "{ not json")
    await repo.createMany({
      requestId: "req-3",
      items: [buildVocabItem("unified-vocab-3", "fleeting")],
    })
    await reviewStoreInstance.saveAllStates({
      "unified-vocab-3": buildReviewState("unified-vocab-3"),
    })

    const result = await syncWithWebdav(
      repo,
      sampleConfig,
      { syncReviews: true, reviewStoreInstance },
      server.fetchFn,
    )

    // A broken preference file is a non-fatal component error: the pass still
    // succeeds for the learning data and reports the config failure as a diagnostic
    expect(result.ok).toBe(true)
    expect(result.components?.dictionary).toMatchObject({ ok: true, remoteUploaded: true })
    expect(result.components?.reviews).toMatchObject({ ok: true, remoteUploaded: true })
    expect(result.components?.config).toMatchObject({ ok: false })
    expect(result.components?.config?.error?.code).toBe("CORRUPTED_REMOTE")

    expect(server.read(DICTIONARY_URL)).toContain("unified-vocab-3")
    expect(server.read(REVIEWS_URL)).toContain("unified-vocab-3")
    // Unknown remote content is preserved and local preferences are untouched
    expect(server.read(CONFIG_URL)).toBe("{ not json")
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
  })

  it("keeps syncing the dictionary and preferences when the review state sync fails", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 1_000)
    await repo.createMany({
      requestId: "req-4",
      items: [buildVocabItem("unified-vocab-4", "momentary")],
    })
    await reviewStoreInstance.saveAllStates({
      "unified-vocab-4": buildReviewState("unified-vocab-4"),
    })

    // The review file answers every request with a server error
    const failingReviews: typeof fetch = async (input, init) => {
      if (requestUrl(input) === REVIEWS_URL) {
        return new Response("Server Error", { status: 500 })
      }
      return server.fetchFn(input, init)
    }

    const result = await syncWithWebdav(
      repo,
      sampleConfig,
      { syncReviews: true, reviewStoreInstance },
      failingReviews,
    )

    expect(result.ok).toBe(true)
    expect(result.components?.dictionary).toMatchObject({ ok: true, remoteUploaded: true })
    expect(result.components?.reviews).toMatchObject({ ok: false })
    expect(result.components?.reviews?.error?.code).toBe("NETWORK_ERROR")
    expect(result.components?.config).toEqual({ ok: true, action: "uploaded" })

    expect(server.read(DICTIONARY_URL)).toContain("unified-vocab-4")
    expect(server.read(CONFIG_URL)).toContain("readbuddy-config")
    // The review file never made it to the server
    expect(server.files.has(REVIEWS_URL)).toBe(false)
  })
})

describe("WebdavSyncEngine preference sync state", () => {
  let db: LocalDictionaryDB
  let repo: LocalDictionaryRepository
  let server: ReturnType<typeof createMockWebdavServer>

  beforeEach(async () => {
    fakeBrowser.reset()
    await storage.removeItem(`local:${CONFIG_STORAGE_KEY}`, { removeMeta: true })
    await storage.removeItem("local:backup_ids")
    await saveStoredWebdavSyncState(INITIAL_WEBDAV_SYNC_STATE)
    await saveStoredWebdavConfig(sampleConfig)

    server = createMockWebdavServer()
    const dbName = `readfrog-unified-engine-test-${Math.random().toString(36).slice(2)}`
    db = new LocalDictionaryDB(dbName)
    await db.open()
    repo = new LocalDictionaryRepository(db)
  })

  afterEach(async () => {
    await storage.removeItem(`local:${CONFIG_STORAGE_KEY}`, { removeMeta: true })
    await storage.removeItem("local:backup_ids")
    await db.delete()
    db.close()
  })

  it("records the successful preference sync status and timestamp in the sync state", async () => {
    const localConfig = buildConfig({ uiLanguage: "ja" })
    await seedLocalConfig(localConfig, 1_700_000_000_000)

    const engine = new WebdavSyncEngine(() => repo, { fetchFn: server.fetchFn })
    const result = await engine.triggerSync({ reason: "manual" })

    expect(result?.ok).toBe(true)
    const state = await getStoredWebdavSyncState()
    expect(state.phase).toBe("idle")
    expect(state.configSyncStatus).toBe("synced")
    expect(state.configLastSuccessTime).not.toBeNull()
    expect(state.configLastAction).toBe("uploaded")
    expect(state.configLastError).toBeNull()
  })

  it("reports a failed preference sync without failing the dictionary sync", async () => {
    server.put(CONFIG_URL, "{ not json")
    await repo.createMany({
      requestId: "req-engine-1",
      items: [buildVocabItem("engine-vocab-1", "toad")],
    })

    const engine = new WebdavSyncEngine(() => repo, { fetchFn: server.fetchFn })
    const result = await engine.triggerSync({ reason: "manual" })

    // Learning data synced, so the pass succeeds; only the config component failed
    expect(result?.ok).toBe(true)
    const state = await getStoredWebdavSyncState()
    expect(state.phase).toBe("idle")
    expect(state.configSyncStatus).toBe("failed")
    expect(state.configLastError?.code).toBe("CORRUPTED_REMOTE")
    expect(state.configLastSuccessTime).toBeNull()
    expect(server.read(DICTIONARY_URL)).toContain("engine-vocab-1")
  })

  it("syncs the preferences on the background debounced path, not only on manual sync", async () => {
    await seedLocalConfig(buildConfig({ uiLanguage: "zh-CN" }), 1_700_000_000_000)

    const engine = new WebdavSyncEngine(() => repo, {
      fetchFn: server.fetchFn,
      debounceMs: 5,
    })
    engine.scheduleDebouncedSync()

    // The debounced pass runs unattended: wait for the config file to land
    await vi.waitFor(() => {
      expect(server.files.has(CONFIG_URL)).toBe(true)
    })

    const state = await getStoredWebdavSyncState()
    expect(state.configSyncStatus).toBe("synced")
    expect(state.configLastAction).toBe("uploaded")
    expect(state.configLastSuccessTime).not.toBeNull()
  })
})
