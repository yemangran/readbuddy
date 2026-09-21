import type { WebdavConfigSnapshot } from "../webdav-sync"
import type { Config } from "@/types/config/config"
import type { WebdavConfig } from "@/utils/local-dictionary/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { getAllBackupsWithMetadata } from "@/utils/backup/storage"
import { CONFIG_SCHEMA_VERSION, CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { SNAPSHOT_MAX_SIZE_BYTES } from "@/utils/local-dictionary/snapshot"
import { testSeries as v100Series } from "../__tests__/example/v100"
import {
  getWebdavConfigFileUrl,
  syncConfigWithWebdav,
  WEBDAV_CONFIG_FILENAME,
} from "../webdav-sync"

const ENDPOINT = "https://dav.example.com/webdav/"
const CONFIG_FILE_URL = `${ENDPOINT}${WEBDAV_CONFIG_FILENAME}`

const sampleConfig: WebdavConfig = {
  endpoint: ENDPOINT,
  username: "testuser",
  password: "secretpassword123",
}

interface StoredFile {
  body: string
  /** `null` models a server that serves the file without an ETag header. */
  etag: string | null
}

interface RecordedRequest {
  method: string
  url: string
  headers: Record<string, string>
}

/**
 * Minimal in-memory WebDAV server: GET/PUT/MKCOL over a path → file map, with
 * ETag-conditional PUT and an optional missing-parent-collection mode.
 */
function createMockWebdavServer() {
  const files = new Map<string, StoredFile>()
  const requests: RecordedRequest[] = []
  let etagCounter = 0
  let parentCollectionMissing = false

  const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const headers = (init?.headers ?? {}) as Record<string, string>
      const method = init?.method ?? "GET"
      requests.push({ method, url, headers })

      if (method === "MKCOL") {
        parentCollectionMissing = false
        return new Response(null, { status: 201 })
      }

      if (method === "GET") {
        const file = files.get(url)
        if (!file) {
          return new Response("Not Found", { status: 404 })
        }
        // Encode explicitly: the shared vitest setup replaces TextEncoder with a
        // UTF-16-code-unit variant that corrupts multi-byte characters.
        return new Response(Buffer.from(file.body, "utf-8"), {
          status: 200,
          headers: file.etag === null ? {} : { etag: file.etag },
        })
      }

      if (method === "PUT") {
        if (parentCollectionMissing) {
          return new Response("Not Found", { status: 404 })
        }
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
    put(url: string, snapshot: WebdavConfigSnapshot) {
      etagCounter += 1
      files.set(url, { body: JSON.stringify(snapshot, null, 2), etag: `"etag-${etagCounter}"` })
    },
    /** Installs a remote file whose GET response carries no ETag header. */
    putWithoutEtag(url: string, snapshot: WebdavConfigSnapshot) {
      files.set(url, { body: JSON.stringify(snapshot, null, 2), etag: null })
    },
    readConfigSnapshot(url: string = CONFIG_FILE_URL): WebdavConfigSnapshot {
      const file = files.get(url)
      if (!file) throw new Error(`No remote file at ${url}`)
      return JSON.parse(file.body) as WebdavConfigSnapshot
    },
    requestMethods(url: string = CONFIG_FILE_URL) {
      return requests.filter((request) => request.url === url).map((request) => request.method)
    },
    putRequests(url: string = CONFIG_FILE_URL) {
      return requests.filter((request) => request.url === url && request.method === "PUT")
    },
    markParentCollectionMissing() {
      parentCollectionMissing = true
    },
  }
}

function buildConfig(overrides: Partial<Config> = {}): Config {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides }
}

function buildRemoteSnapshot(
  config: Config,
  updatedAt: number,
  schemaVersion: number = CONFIG_SCHEMA_VERSION,
): WebdavConfigSnapshot {
  return {
    format: "readbuddy-config",
    version: 1,
    schemaVersion,
    updatedAt,
    config,
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

async function readLocalConfigLastModifiedAt(): Promise<number> {
  const meta = await storage.getMeta(`local:${CONFIG_STORAGE_KEY}`)
  return meta?.lastModifiedAt as number
}

describe("WebDAV config sync", () => {
  let server: ReturnType<typeof createMockWebdavServer>

  beforeEach(async () => {
    server = createMockWebdavServer()
    // Each test starts from "no local config", like a device that never synced
    await storage.removeItem(`local:${CONFIG_STORAGE_KEY}`, { removeMeta: true })
    await storage.removeItem("local:backup_ids")
  })

  afterEach(async () => {
    await storage.removeItem(`local:${CONFIG_STORAGE_KEY}`, { removeMeta: true })
    await storage.removeItem("local:backup_ids")
  })

  it("builds the canonical readbuddy-config.json URL from the configured endpoint", () => {
    expect(getWebdavConfigFileUrl(ENDPOINT)).toBe(CONFIG_FILE_URL)
    expect(getWebdavConfigFileUrl("https://dav.example.com/webdav")).toBe(CONFIG_FILE_URL)
    expect(getWebdavConfigFileUrl(CONFIG_FILE_URL)).toBe(CONFIG_FILE_URL)
    // An endpoint pointing at a sibling sync file still resolves to the config file
    expect(getWebdavConfigFileUrl(`${ENDPOINT}readbuddy.json`)).toBe(CONFIG_FILE_URL)
    expect(getWebdavConfigFileUrl("https://dav.jianguoyun.com/dav/")).toBe(
      "https://dav.jianguoyun.com/dav/readbuddy/readbuddy-config.json",
    )
    expect(() => getWebdavConfigFileUrl("")).toThrow("WebDAV endpoint cannot be empty")
  })

  it("uploads the local config when the WebDAV server has no config file yet", async () => {
    const localConfig = buildConfig({ uiLanguage: "zh-CN" })
    await seedLocalConfig(localConfig, 1_700_000_000_000)

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result).toEqual({ ok: true, action: "uploaded" })
    expect(server.requestMethods()).toEqual(["GET", "PUT"])
    // Creating the file is conditional: a remote file appearing meanwhile wins
    expect(server.putRequests()[0]!.headers["If-None-Match"]).toBe("*")

    const remoteSnapshot = server.readConfigSnapshot()
    expect(remoteSnapshot.format).toBe("readbuddy-config")
    expect(remoteSnapshot.version).toBe(1)
    expect(remoteSnapshot.schemaVersion).toBe(CONFIG_SCHEMA_VERSION)
    expect(remoteSnapshot.updatedAt).toBe(1_700_000_000_000)
    expect(remoteSnapshot.config).toEqual(localConfig)

    // An upload never rewrites local preferences or the backup history
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
  })

  it("creates the missing parent collection and retries the upload", async () => {
    const localConfig = buildConfig({ uiLanguage: "ja" })
    await seedLocalConfig(localConfig, 1_700_000_000_000)
    server.markParentCollectionMissing()

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result).toEqual({ ok: true, action: "uploaded" })
    // The upload is retried from the top of the loop after the collection exists
    expect(server.requests.map((request) => request.method)).toEqual([
      "GET",
      "PUT",
      "MKCOL",
      "GET",
      "PUT",
    ])
    expect(server.readConfigSnapshot().config).toEqual(localConfig)
  })

  it("skips the upload when local and remote configs already agree", async () => {
    const localConfig = buildConfig({ uiLanguage: "ko" })
    await seedLocalConfig(localConfig, 5_000)
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(localConfig, 5_000))

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result).toEqual({ ok: true, action: "no-change" })
    expect(server.requestMethods()).toEqual(["GET"])
  })

  it("uploads the local config when it is newer than the remote one", async () => {
    const localConfig = buildConfig({ uiLanguage: "es" })
    const remoteConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 9_000)
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(remoteConfig, 1_000))

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result).toEqual({ ok: true, action: "uploaded" })
    expect(server.readConfigSnapshot()).toMatchObject({
      updatedAt: 9_000,
      config: localConfig,
    })
    // Local config is untouched by an upload
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
  })

  it("guards a later upload with the ETag of the file it just read", async () => {
    const localConfig = buildConfig({ uiLanguage: "es" })
    await seedLocalConfig(localConfig, 1_000)
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(buildConfig({ uiLanguage: "en" }), 500))

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result).toEqual({ ok: true, action: "uploaded" })
    expect(server.putRequests()[0]!.headers["If-Match"]).toBe(`"etag-1"`)
    expect(server.putRequests()[0]!.headers["If-None-Match"]).toBeUndefined()

    // The next upload is guarded by the ETag the previous upload produced
    await seedLocalConfig(buildConfig({ uiLanguage: "ko" }), 3_000)
    const secondResult = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(secondResult).toEqual({ ok: true, action: "uploaded" })
    expect(server.putRequests()[1]!.headers["If-Match"]).toBe(`"etag-2"`)
  })

  it("refuses to upload over a remote file the server serves without an ETag", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    const remoteConfig = buildConfig({ uiLanguage: "zh-CN" })
    await seedLocalConfig(localConfig, 9_000)
    server.putWithoutEtag(CONFIG_FILE_URL, buildRemoteSnapshot(remoteConfig, 1_000))

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("CONDITION_NOT_SUPPORTED")
    // Unknown remote content is preserved, and local config is untouched
    expect(server.readConfigSnapshot().config).toEqual(remoteConfig)
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(server.putRequests()).toHaveLength(0)
  })

  it("rejects a remote config file whose envelope is missing updatedAt", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 1_000)
    const incomplete = buildRemoteSnapshot(
      buildConfig({ uiLanguage: "zh-CN" }),
      5_000,
    ) as Partial<WebdavConfigSnapshot>
    delete incomplete.updatedAt
    server.files.set(CONFIG_FILE_URL, {
      body: JSON.stringify(incomplete, null, 2),
      etag: `"etag-1"`,
    })

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("CORRUPTED_REMOTE")
    // Neither side is overwritten on an unreadable envelope
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
    expect(server.putRequests()).toHaveLength(0)
  })

  it("rejects a remote config file larger than the size budget", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 1_000)
    server.files.set(CONFIG_FILE_URL, {
      body: `{"format":"readbuddy-config","pad":"${" ".repeat(SNAPSHOT_MAX_SIZE_BYTES)}"}`,
      etag: `"etag-1"`,
    })

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("BUDGET_EXCEEDED")
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(server.putRequests()).toHaveLength(0)
  })

  it("reports a failed upload without touching local config", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 1_000)

    const failingUpload: typeof fetch = async () => new Response("Server Error", { status: 500 })

    const result = await syncConfigWithWebdav(sampleConfig, failingUpload)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("NETWORK_ERROR")
    expect(result.error?.message).toContain("500")
    expect(await readLocalConfig()).toEqual(localConfig)
  })

  it("backs the local config up, applies the newer remote config, and broadcasts the change", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    const remoteConfig = buildConfig({ uiLanguage: "zh-CN" })
    await seedLocalConfig(localConfig, 1_000)
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(remoteConfig, 5_000))

    // Active views watch the config storage key; assert the broadcast fires.
    const broadcastConfigs: Config[] = []
    const unwatch = storage.watch<Config>(`local:${CONFIG_STORAGE_KEY}`, (config) => {
      if (config) broadcastConfigs.push(config)
    })

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result).toEqual({ ok: true, action: "downloaded", backupCreated: true })

    // The remote config is now the local config, stamped with the remote
    // modification time so the next sync sees both sides as equal.
    expect(await readLocalConfig()).toEqual(remoteConfig)
    expect(await readLocalConfigLastModifiedAt()).toBe(5_000)

    // The overwritten config stays recoverable from the backup history
    const backups = await getAllBackupsWithMetadata()
    expect(backups).toHaveLength(1)
    expect(backups[0]!.config).toEqual(localConfig)

    expect(broadcastConfigs.at(-1)).toEqual(remoteConfig)

    // Nothing was uploaded: the remote file already held the winning config
    expect(server.requestMethods()).toEqual(["GET"])
    expect(server.files.get(CONFIG_FILE_URL)!.etag).toBe(`"etag-1"`)

    unwatch()
  })

  it("does not re-upload a config it just downloaded", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    const remoteConfig = buildConfig({ uiLanguage: "zh-CN" })
    await seedLocalConfig(localConfig, 1_000)
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(remoteConfig, 5_000))

    await syncConfigWithWebdav(sampleConfig, server.fetchFn)
    const secondResult = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(secondResult).toEqual({ ok: true, action: "no-change" })
    expect(server.requestMethods()).toEqual(["GET", "GET"])
  })

  it("migrates a remote config written by an older schema version before applying it", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 1_000)
    // Frozen v100 fixture: an older schema version than this extension supports
    const legacyConfig = v100Series["complex-config-from-v020"]!.config as Config
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(legacyConfig, 5_000, 100))

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result).toEqual({ ok: true, action: "downloaded", backupCreated: true })
    const applied = await readLocalConfig()
    expect(applied.language).toMatchObject({ sourceCode: "spa", targetCode: "eng" })
    expect(applied.translationHub).toEqual({ shortcut: "Alt+Shift+H" })
  })

  it("re-reads the remote config and downloads it after losing a concurrent upload race", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    const concurrentConfig = buildConfig({ uiLanguage: "ru" })
    await seedLocalConfig(localConfig, 9_000)
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(buildConfig({ uiLanguage: "ja" }), 1_000))

    // Another device publishes a newer config and rejects the conditional PUT in
    // the same moment — exactly the race the ETag precondition exists for.
    const racingFetch: typeof fetch = async (input, init) => {
      const response = await server.fetchFn(input, init)
      if ((init?.method ?? "GET") === "PUT") {
        server.put(CONFIG_FILE_URL, buildRemoteSnapshot(concurrentConfig, 20_000))
        return new Response("Precondition Failed", { status: 412 })
      }
      return response
    }

    const result = await syncConfigWithWebdav(sampleConfig, racingFetch)

    expect(result).toEqual({ ok: true, action: "downloaded", backupCreated: true })
    expect(await readLocalConfig()).toEqual(concurrentConfig)
    const backups = await getAllBackupsWithMetadata()
    expect(backups).toHaveLength(1)
    expect(backups[0]!.config).toEqual(localConfig)
  })

  it("keeps the local config when the server rejects the credentials", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 1_000)
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(buildConfig({ uiLanguage: "zh-CN" }), 5_000))

    const unauthorized: typeof fetch = async () => new Response("Unauthorized", { status: 401 })

    const result = await syncConfigWithWebdav(sampleConfig, unauthorized)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("AUTH_FAILED")
    expect(result.error?.message).not.toContain(sampleConfig.password)
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
  })

  it("refuses to apply a remote config written by a newer schema version", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 1_000)
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(localConfig, 5_000, CONFIG_SCHEMA_VERSION + 1))

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("UNSUPPORTED_VERSION")
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
  })

  it("reports corrupted remote config without touching local config", async () => {
    const localConfig = buildConfig({ uiLanguage: "en" })
    await seedLocalConfig(localConfig, 1_000)
    server.files.set(CONFIG_FILE_URL, { body: "{ not json", etag: `"etag-1"` })

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("CORRUPTED_REMOTE")
    expect(await readLocalConfig()).toEqual(localConfig)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
  })

  it("lets the remote config win when no local config is stored yet", async () => {
    const remoteConfig = buildConfig({ uiLanguage: "zh-CN" })
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(remoteConfig, 5_000))

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    // Nothing real was overwritten, so no fabricated defaults enter the history
    expect(result).toEqual({ ok: true, action: "downloaded", backupCreated: false })
    expect(await readLocalConfig()).toEqual(remoteConfig)
    expect(await readLocalConfigLastModifiedAt()).toBe(5_000)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
  })

  it("lets the remote config win when the stored local config is invalid", async () => {
    const remoteConfig = buildConfig({ uiLanguage: "zh-CN" })
    await seedLocalConfig({ uiLanguage: "not-a-locale" } as unknown as Config, 9_000)
    server.put(CONFIG_FILE_URL, buildRemoteSnapshot(remoteConfig, 5_000))

    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    // An unusable local config carries no modification time, so it never
    // uploads fabricated defaults over a healthy remote file.
    expect(result).toEqual({ ok: true, action: "downloaded", backupCreated: false })
    expect(await readLocalConfig()).toEqual(remoteConfig)
    expect(await getAllBackupsWithMetadata()).toHaveLength(0)
  })

  it("uploads defaults without a modification time when nothing is stored locally", async () => {
    const result = await syncConfigWithWebdav(sampleConfig, server.fetchFn)

    expect(result).toEqual({ ok: true, action: "uploaded" })
    const remoteSnapshot = server.readConfigSnapshot()
    expect(remoteSnapshot.updatedAt).toBe(0)
    expect(remoteSnapshot.config).toEqual(DEFAULT_CONFIG)
  })
})
