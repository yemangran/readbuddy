import type {
  DictionarySnapshotV1,
  RemoteSnapshotSummary,
  WebdavConfig,
  WebdavConfigSyncReport,
  WebdavError,
  WebdavSyncComponentReport,
  WebdavSyncComponents,
  WebdavSyncResult,
  WebdavSyncState,
} from "./types"
import type { ReviewStore } from "@/utils/review/store"
import { browser, storage } from "#imports"
import { syncConfigWithWebdav } from "@/utils/config/webdav-sync"
import { logger } from "@/utils/logger"
import { syncReviewsWithWebdav, getWebdavReviewsFileUrl } from "@/utils/review/sync"
import { type LocalDictionaryRepository } from "./repository"
import {
  exportDictionarySnapshot,
  parseAndValidateSnapshot,
  SNAPSHOT_MAX_SIZE_BYTES,
} from "./snapshot"

export { getWebdavReviewsFileUrl }

export const WEBDAV_DICTIONARY_FILENAME = "readbuddy.json"
export const WEBDAV_CONFIG_STORAGE_KEY = "local:webdavConfig"
export const WEBDAV_SYNC_STATE_STORAGE_KEY = "local:webdavSyncState"
export const MAX_CONDITIONAL_RETRIES = 3

export const INITIAL_WEBDAV_SYNC_STATE: WebdavSyncState = {
  phase: "idle",
  lastSuccessTime: null,
  lastAttemptTime: null,
  nextRetryTime: null,
  retryCount: 0,
  pendingChangesCount: 0,
  lastError: null,
  pausedReason: null,
  reviewsLastSuccessTime: null,
  configSyncStatus: "idle",
  configLastSuccessTime: null,
  configLastAction: null,
  configLastError: null,
}

export async function getStoredWebdavSyncState(): Promise<WebdavSyncState> {
  try {
    const state = await storage.getItem<WebdavSyncState>(WEBDAV_SYNC_STATE_STORAGE_KEY)
    if (state && typeof state === "object") {
      return {
        ...INITIAL_WEBDAV_SYNC_STATE,
        ...state,
      }
    }
    return { ...INITIAL_WEBDAV_SYNC_STATE }
  } catch (error) {
    logger.warn("[WebDAV] Failed to read stored WebDAV sync state", error)
    return { ...INITIAL_WEBDAV_SYNC_STATE }
  }
}

export async function saveStoredWebdavSyncState(
  state: Partial<WebdavSyncState>,
): Promise<WebdavSyncState> {
  const current = await getStoredWebdavSyncState()
  const updated: WebdavSyncState = {
    ...current,
    ...state,
  }
  await storage.setItem<WebdavSyncState>(WEBDAV_SYNC_STATE_STORAGE_KEY, updated)
  return updated
}

export function normalizeWebdavEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim()
  if (!trimmed) {
    throw new Error("WebDAV endpoint cannot be empty")
  }
  const url = new URL(trimmed)
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported protocol: ${url.protocol}`)
  }
  // Jianguoyun root path (/dav or /dav/) cannot host bare files directly.
  // Auto-append dedicated app directory /readbuddy/
  if (url.hostname === "dav.jianguoyun.com") {
    const cleanPath = url.pathname.replace(/\/+$/, "")
    if (cleanPath === "/dav" || cleanPath === "") {
      url.pathname = "/dav/readbuddy/"
    }
  }
  return url.toString()
}

export function getWebdavParentCollectionUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl)
    const segments = url.pathname.split("/").filter(Boolean)
    if (segments.length <= 1) {
      return null
    }
    segments.pop()
    url.pathname = `/${segments.join("/")}/`
    return url.toString()
  } catch {
    return null
  }
}

export function getWebdavFileUrl(endpoint: string): string {
  const normalized = normalizeWebdavEndpoint(endpoint)
  const url = new URL(normalized)
  if (url.pathname.endsWith(`/${WEBDAV_DICTIONARY_FILENAME}`)) {
    return url.toString()
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/"
  }
  url.pathname += WEBDAV_DICTIONARY_FILENAME
  return url.toString()
}

export function getWebdavAuthHeader(username: string, password: string): string {
  const str = `${username}:${password}`
  let encoded: string
  if (typeof btoa !== "undefined") {
    encoded = btoa(unescape(encodeURIComponent(str)))
  } else {
    encoded = Buffer.from(str, "utf-8").toString("base64")
  }
  return `Basic ${encoded}`
}

export async function getStoredWebdavConfig(): Promise<WebdavConfig | null> {
  try {
    const config = await storage.getItem<WebdavConfig>(WEBDAV_CONFIG_STORAGE_KEY)
    if (config?.endpoint && config?.username) {
      return config
    }
    return null
  } catch (error) {
    logger.warn("[WebDAV] Failed to read stored WebDAV config", error)
    return null
  }
}

export async function saveStoredWebdavConfig(config: WebdavConfig): Promise<void> {
  await storage.setItem<WebdavConfig>(WEBDAV_CONFIG_STORAGE_KEY, {
    endpoint: config.endpoint.trim(),
    username: config.username.trim(),
    password: config.password,
  })
}

export async function clearStoredWebdavConfig(): Promise<void> {
  await storage.removeItem(WEBDAV_CONFIG_STORAGE_KEY)
}

export async function requestWebdavHostPermission(endpoint: string): Promise<boolean> {
  try {
    const url = new URL(endpoint.trim())
    const origin = `${url.protocol}//${url.host}/*`
    if (!browser?.permissions?.request) {
      return true
    }
    return await browser.permissions.request({
      origins: [origin],
    })
  } catch {
    return false
  }
}

export async function testWebdavConnection(
  config: WebdavConfig,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<{ ok: boolean; error?: WebdavError }> {
  let fileUrl: string
  try {
    fileUrl = getWebdavFileUrl(config.endpoint)
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || "Invalid WebDAV endpoint URL",
        retryable: false,
      },
    }
  }

  const authHeader = getWebdavAuthHeader(config.username, config.password)

  try {
    const res = await fetchFn(fileUrl, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json, text/plain, */*",
      },
    })

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: {
          code: "AUTH_FAILED",
          message: "Authentication failed. Invalid username or password.",
          retryable: false,
        },
      }
    }

    if (res.status === 200 || res.status === 404) {
      return { ok: true }
    }

    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: `WebDAV server returned HTTP ${res.status}`,
        retryable: true,
      },
    }
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || "Failed to connect to WebDAV server",
        retryable: true,
      },
    }
  }
}

export interface SyncWithWebdavOptions {
  maxRetries?: number
  forceUnconditional?: boolean
  syncReviews?: boolean
  reviewStoreInstance?: ReviewStore
}

/**
 * Review states are a side component of the unified sync: a failure is reported
 * in the diagnostics instead of failing the pass, so the dictionary and the
 * config still sync. Returns `undefined` when the pass does not carry reviews.
 */
async function syncReviewsComponent(
  repository: LocalDictionaryRepository,
  config: WebdavConfig,
  options?: SyncWithWebdavOptions,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<WebdavSyncComponentReport | undefined> {
  if (!options?.syncReviews) return undefined
  let validRecordIds: Set<string> | undefined
  try {
    const allActive = await repository.list({ pageSize: 100000 })
    if (allActive.ok) {
      validRecordIds = new Set(allActive.data.records.map((r) => r.id))
    }
  } catch {
    // ignore
  }

  try {
    const result = await syncReviewsWithWebdav(
      config,
      {
        forceUnconditional: options.forceUnconditional,
        maxRetries: options.maxRetries,
        validRecordIds,
      },
      fetchFn,
      options.reviewStoreInstance,
    )
    if (result.ok) {
      return {
        ok: true,
        remoteUploaded: result.remoteUploaded,
        localUpdated: result.localUpdated,
      }
    }
    return { ok: false, error: result.error }
  } catch (err: any) {
    logger.warn("[WebDAV] Review sync failed during unified sync", err)
    return {
      ok: false,
      error: {
        code: "STORAGE_ERROR",
        message: err?.message || "Review sync failed unexpectedly",
        retryable: true,
      },
    }
  }
}

/**
 * Config is the third component of the unified sync (`readbuddy-config.json`).
 * Like review states, a failure here — a corrupted remote file, an unsupported
 * schema version, a failed upload — is reported as a diagnostic and never blocks
 * the learning data.
 *
 * Note that this deliberately diverges from the dictionary component's fatality:
 * `AUTH_FAILED` and `UNSUPPORTED_VERSION` on the config file do not pause the
 * engine, because pausing would block the dictionary sync too — the opposite of
 * what the unified pipeline promises. The engine surfaces them through
 * `configSyncStatus` / `configLastError` instead.
 */
export async function syncConfigComponent(
  config: WebdavConfig,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<WebdavConfigSyncReport> {
  try {
    const result = await syncConfigWithWebdav(config, fetchFn)
    if (result.ok) {
      return {
        ok: true,
        action: result.action,
        backupCreated: result.backupCreated,
      }
    }
    return { ok: false, error: result.error }
  } catch (err: any) {
    logger.warn("[WebDAV] Config sync failed during unified sync", err)
    return {
      ok: false,
      error: {
        code: "STORAGE_ERROR",
        message: err?.message || "Config sync failed unexpectedly",
        retryable: true,
      },
    }
  }
}

/**
 * Runs the remaining components of the pass once the dictionary data has
 * settled, and collects the full per-component diagnostics.
 */
async function syncRemainingComponents(
  dictionaryReport: WebdavSyncComponentReport,
  repository: LocalDictionaryRepository,
  config: WebdavConfig,
  options?: SyncWithWebdavOptions,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<WebdavSyncComponents> {
  const reviews = await syncReviewsComponent(repository, config, options, fetchFn)
  const configReport = await syncConfigComponent(config, fetchFn)
  return { dictionary: dictionaryReport, reviews, config: configReport }
}

export type WebdavPutOutcome =
  | { status: "success"; response: Response; etag: string | null }
  | { status: "precondition-failed" }
  | { status: "parent-collection-created" }
  | { status: "error"; error: WebdavError }

export async function sendWebdavPutWithPrecondition(options: {
  fileUrl: string
  headers: Record<string, string>
  body: string
  authHeader: string
  fetchFn?: typeof fetch
  createdParentCollection?: boolean
  errorContext?: string
}): Promise<WebdavPutOutcome> {
  const {
    fileUrl,
    headers,
    body,
    authHeader,
    fetchFn = globalThis.fetch,
    createdParentCollection = false,
    errorContext = "upload",
  } = options

  let putRes: Response
  try {
    putRes = await fetchFn(fileUrl, {
      method: "PUT",
      headers,
      body,
    })
  } catch (err: any) {
    return {
      status: "error",
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || `Failed to ${errorContext} to WebDAV`,
        retryable: true,
      },
    }
  }

  if (putRes.status === 412) {
    return { status: "precondition-failed" }
  }

  if (putRes.status === 401 || putRes.status === 403) {
    return {
      status: "error",
      error: {
        code: "AUTH_FAILED",
        message: `Authentication failed during ${errorContext}`,
        retryable: false,
      },
    }
  }

  if (putRes.status === 400 || putRes.status === 501) {
    return {
      status: "error",
      error: {
        code: "CONDITION_NOT_SUPPORTED",
        message: "WebDAV server does not support conditional PUT headers",
        retryable: false,
      },
    }
  }

  if (putRes.status === 200 || putRes.status === 201 || putRes.status === 204) {
    const etag = putRes.headers.get("etag") || putRes.headers.get("ETag")
    return { status: "success", response: putRes, etag }
  }

  if ((putRes.status === 404 || putRes.status === 409) && !createdParentCollection) {
    const parentUrl = getWebdavParentCollectionUrl(fileUrl)
    if (parentUrl) {
      logger.info(
        `[WebDAV] Parent collection missing (HTTP ${putRes.status}), attempting MKCOL: ${parentUrl}`,
      )
      try {
        const mkcolRes = await fetchFn(parentUrl, {
          method: "MKCOL",
          headers: {
            Authorization: authHeader,
          },
        })
        if (mkcolRes.status === 201 || mkcolRes.status === 405 || mkcolRes.status === 200) {
          logger.info(`[WebDAV] MKCOL parent collection succeeded, retrying ${errorContext}...`)
          return { status: "parent-collection-created" }
        }
      } catch (mkcolErr) {
        logger.warn("[WebDAV] Failed to execute MKCOL on parent collection", mkcolErr)
      }
    }
  }

  if (putRes.status === 404) {
    let bodySnippet = ""
    try {
      bodySnippet = await putRes.text()
    } catch {
      // ignore
    }
    const isJianguoyun = fileUrl.includes("dav.jianguoyun.com")
    const errorMsg =
      isJianguoyun || bodySnippet.includes("ObjectNotFound")
        ? "WebDAV 目标目录不存在（坚果云根目录不支持直接放置文件，请在服务地址中包含同步文件夹如 /dav/readbuddy/）"
        : "WebDAV server returned HTTP 404 on upload: parent collection does not exist"

    return {
      status: "error",
      error: {
        code: "NETWORK_ERROR",
        message: errorMsg,
        retryable: false,
      },
    }
  }

  return {
    status: "error",
    error: {
      code: "NETWORK_ERROR",
      message: `WebDAV server returned HTTP ${putRes.status} on upload`,
      retryable: true,
    },
  }
}

export async function syncWithWebdav(
  repository: LocalDictionaryRepository,
  config: WebdavConfig,
  options?: SyncWithWebdavOptions,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<WebdavSyncResult> {
  let fileUrl: string
  try {
    fileUrl = getWebdavFileUrl(config.endpoint)
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || "Invalid WebDAV endpoint URL",
        retryable: false,
      },
    }
  }

  const authHeader = getWebdavAuthHeader(config.username, config.password)
  const maxRetries = options?.maxRetries ?? MAX_CONDITIONAL_RETRIES
  let attempt = 0
  let createdParentCollection = false

  while (attempt < maxRetries) {
    attempt++

    // 1. Fetch remote content and ETag
    let getRes: Response
    try {
      getRes = await fetchFn(fileUrl, {
        method: "GET",
        headers: {
          Authorization: authHeader,
          Accept: "application/json, text/plain, */*",
        },
      })
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: err?.message || "Network error fetching remote WebDAV file",
          retryable: true,
        },
      }
    }

    if (getRes.status === 401 || getRes.status === 403) {
      return {
        ok: false,
        error: {
          code: "AUTH_FAILED",
          message: "Authentication failed. Invalid username or password.",
          retryable: false,
        },
      }
    }

    let remoteExists: boolean
    let remoteEtag: string | null
    let remoteSnapshot: DictionarySnapshotV1

    if (getRes.status === 404) {
      // Remote file does not exist yet (First sync: remote does not exist)
      remoteExists = false
      remoteEtag = null
      remoteSnapshot = {
        format: "readfrog-local",
        version: 1,
        updatedAt: 0,
        vocabularies: [],
        conflictVersions: [],
      }
    } else if (getRes.status === 200) {
      remoteExists = true
      remoteEtag = getRes.headers.get("etag") || getRes.headers.get("ETag")

      if (!remoteEtag && !options?.forceUnconditional) {
        return {
          ok: false,
          error: {
            code: "CONDITION_NOT_SUPPORTED",
            message: "Remote WebDAV server did not provide ETag for conditional requests",
            retryable: false,
          },
        }
      }

      let text: string
      try {
        text = await getRes.text()
      } catch (err: any) {
        return {
          ok: false,
          error: {
            code: "NETWORK_ERROR",
            message: err?.message || "Failed to read response body",
            retryable: true,
          },
        }
      }

      if (text.length > SNAPSHOT_MAX_SIZE_BYTES) {
        return {
          ok: false,
          error: {
            code: "BUDGET_EXCEEDED",
            message: `Remote snapshot size (${text.length} bytes) exceeds budget of ${SNAPSHOT_MAX_SIZE_BYTES} bytes`,
            retryable: false,
          },
        }
      }

      const validation = parseAndValidateSnapshot(text)
      if (!validation.ok) {
        const isUnsupported = validation.error.includes("Unsupported version")
        return {
          ok: false,
          error: {
            code: isUnsupported ? "UNSUPPORTED_VERSION" : "CORRUPTED_REMOTE",
            message: validation.error,
            retryable: false,
          },
        }
      }

      remoteSnapshot = validation.snapshot
    } else {
      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: `Unexpected HTTP status ${getRes.status} from WebDAV server`,
          retryable: true,
        },
      }
    }

    // 2. Reconcile with local database via repository.applySyncMerge
    const mergeReply = await repository.applySyncMerge(remoteSnapshot)
    if (!mergeReply.ok) {
      const err = mergeReply.error
      const isIntegrity =
        err.message?.includes("Integrity violation") ||
        err.message?.includes("mismatched immutable") ||
        err.message?.includes("Record integrity error") ||
        err.message?.includes("integrity")
      return {
        ok: false,
        error: {
          code: isIntegrity ? "INTEGRITY_CONFLICT" : "STORAGE_ERROR",
          message: err.message || "Failed to merge with local storage",
          retryable: err.retryable,
        },
      }
    }

    const {
      localUpdated,
      addedCount,
      updatedCount,
      deletedCount,
      preservedCount,
      addedConflictCount,
      mergedSnapshot,
      needsRemoteUpload,
    } = mergeReply.data
    const syncSequence = mergeReply.changeSequence

    // 3. If remote does not need upload (e.g. remote already had everything or local was empty)
    if (!needsRemoteUpload && remoteExists) {
      await repository.clearSyncChanges(syncSequence)
      const components = await syncRemainingComponents(
        { ok: true, remoteUploaded: false, localUpdated },
        repository,
        config,
        options,
        fetchFn,
      )
      return {
        ok: true,
        remoteUploaded: false,
        localUpdated,
        etag: remoteEtag,
        stats: {
          addedCount,
          updatedCount,
          deletedCount,
          preservedCount,
          addedConflictCount,
        },
        components,
      }
    }

    // 4. Upload merged snapshot to remote with conditional header
    const uploadBody = exportDictionarySnapshot(
      mergedSnapshot.vocabularies,
      mergedSnapshot.conflictVersions,
    )

    const putHeaders: Record<string, string> = {
      Authorization: authHeader,
      "Content-Type": "application/json; charset=utf-8",
    }

    if (!options?.forceUnconditional) {
      if (remoteExists) {
        if (remoteEtag) {
          const trimmedEtag = remoteEtag.trim()
          putHeaders["If-Match"] =
            trimmedEtag.startsWith('"') || trimmedEtag.startsWith("W/")
              ? trimmedEtag
              : `"${trimmedEtag}"`
        }
      } else {
        putHeaders["If-None-Match"] = "*"
      }
    }

    const putOutcome = await sendWebdavPutWithPrecondition({
      fileUrl,
      headers: putHeaders,
      body: uploadBody,
      authHeader,
      fetchFn,
      createdParentCollection,
      errorContext: "upload snapshot",
    })

    if (putOutcome.status === "precondition-failed") {
      logger.info(
        `[WebDAV] Precondition failed (412) on attempt ${attempt}. Retrying conditional upload...`,
      )
      continue
    }

    if (putOutcome.status === "parent-collection-created") {
      createdParentCollection = true
      attempt-- // Do not consume an attempt for collection creation
      continue
    }

    if (putOutcome.status === "error") {
      return {
        ok: false,
        localUpdated,
        stats: {
          addedCount,
          updatedCount,
          deletedCount,
          preservedCount,
          addedConflictCount,
        },
        error: putOutcome.error,
      }
    }

    const newEtag = putOutcome.etag
    await repository.clearSyncChanges(syncSequence)
    const components = await syncRemainingComponents(
      { ok: true, remoteUploaded: true, localUpdated },
      repository,
      config,
      options,
      fetchFn,
    )
    return {
      ok: true,
      remoteUploaded: true,
      localUpdated,
      etag: newEtag || remoteEtag,
      stats: {
        addedCount,
        updatedCount,
        deletedCount,
        preservedCount,
        addedConflictCount,
      },
      components,
    }
  }

  // If we exited the loop, max retries were exceeded
  return {
    ok: false,
    error: {
      code: "CONDITION_FAILED_MAX_RETRIES",
      message: `Concurrency condition failed: exceeded retry limit of ${maxRetries}`,
      retryable: true,
    },
  }
}

export async function fetchRemoteSnapshotSummary(
  config: WebdavConfig,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<{ ok: true; summary: RemoteSnapshotSummary } | { ok: false; error: WebdavError }> {
  let fileUrl: string
  try {
    fileUrl = getWebdavFileUrl(config.endpoint)
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || "Invalid WebDAV endpoint URL",
        retryable: false,
      },
    }
  }

  const authHeader = getWebdavAuthHeader(config.username, config.password)

  try {
    const res = await fetchFn(fileUrl, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json, text/plain, */*",
      },
    })

    if (res.status === 404) {
      return {
        ok: true,
        summary: {
          exists: false,
        },
      }
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: {
          code: "AUTH_FAILED",
          message: "Authentication failed. Invalid username or password.",
          retryable: false,
        },
      }
    }

    if (res.status !== 200) {
      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: `Server returned HTTP ${res.status}`,
          retryable: true,
        },
      }
    }

    const etag = res.headers.get("etag") || res.headers.get("ETag")
    const text = await res.text()
    const validation = parseAndValidateSnapshot(text)
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "CORRUPTED_REMOTE",
          message: validation.error,
          retryable: false,
        },
      }
    }

    return {
      ok: true,
      summary: {
        exists: true,
        etag,
        updatedAt: validation.snapshot.updatedAt,
        recordCount: validation.snapshot.vocabularies.length,
        conflictCount: validation.snapshot.conflictVersions.length,
      },
    }
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || "Failed to fetch remote snapshot summary",
        retryable: true,
      },
    }
  }
}
