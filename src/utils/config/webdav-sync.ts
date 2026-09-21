import type { Config } from "@/types/config/config"
import type { ConfigMeta } from "@/types/config/meta"
import type { WebdavConfig, WebdavError } from "@/utils/local-dictionary/types"
import { dequal } from "dequal"
import { storage } from "#imports"
import { configSchema } from "@/types/config/config"
import { addBackup } from "@/utils/backup/storage"
import { EXTENSION_VERSION } from "@/utils/constants/app"
import { CONFIG_SCHEMA_VERSION, CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  getWebdavAuthHeader,
  getWebdavParentCollectionUrl,
  normalizeWebdavEndpoint,
  WEBDAV_DICTIONARY_FILENAME,
} from "@/utils/local-dictionary/webdav"
import { logger } from "@/utils/logger"
import { REVIEWS_REMOTE_FILENAME } from "@/utils/review/sync"
import { ConfigVersionTooNewError } from "./errors"
import { migrateConfig } from "./migration"
import { setLocalConfigAndMeta } from "./storage"

/**
 * Canonical remote filename for extension preferences, living next to
 * `readbuddy.json` (dictionary) and `readbuddy-reviews.json` (review states) in
 * the user's WebDAV directory.
 */
export const WEBDAV_CONFIG_FILENAME = "readbuddy-config.json"
export const CONFIG_SNAPSHOT_FORMAT = "readbuddy-config"
export const CONFIG_SNAPSHOT_VERSION = 1
export const MAX_CONFIG_SYNC_RETRIES = 3

/**
 * Wire envelope of `readbuddy-config.json`. `updatedAt` carries the local
 * config's `lastModifiedAt` stamp, which is the only field the Last-Modified-Wins
 * reconciliation compares.
 */
export interface WebdavConfigSnapshot {
  format: typeof CONFIG_SNAPSHOT_FORMAT
  version: typeof CONFIG_SNAPSHOT_VERSION
  schemaVersion: number
  updatedAt: number
  config: Config
}

export type ConfigSyncAction = "uploaded" | "downloaded" | "no-change"

export interface ConfigSyncResult {
  ok: boolean
  action?: ConfigSyncAction
  /** A local history snapshot was taken because remote config replaced local config. */
  backupCreated?: boolean
  error?: WebdavError
}

export interface SyncConfigWithWebdavOptions {
  maxRetries?: number
  /**
   * Invoked after remote config replaced the local one. Writing `local:config`
   * already notifies every extension context through the storage watchers; this
   * hook lets the caller refresh UI state that does not watch storage.
   */
  onConfigApplied?: (config: Config) => Promise<void> | void
}

export function getWebdavConfigFileUrl(endpoint: string): string {
  const normalized = normalizeWebdavEndpoint(endpoint)
  const url = new URL(normalized)
  // Tolerate endpoints that already point at a sibling sync file
  // (e.g. `.../readbuddy.json`) instead of the collection directory.
  const siblingFile = [
    WEBDAV_CONFIG_FILENAME,
    WEBDAV_DICTIONARY_FILENAME,
    REVIEWS_REMOTE_FILENAME,
  ].find((name) => url.pathname.endsWith(`/${name}`))
  if (siblingFile) {
    url.pathname = `${url.pathname.slice(0, -siblingFile.length)}${WEBDAV_CONFIG_FILENAME}`
    return url.toString()
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/"
  }
  url.pathname += WEBDAV_CONFIG_FILENAME
  return url.toString()
}

export function exportConfigSnapshot(config: Config, updatedAt: number): string {
  const snapshot: WebdavConfigSnapshot = {
    format: CONFIG_SNAPSHOT_FORMAT,
    version: CONFIG_SNAPSHOT_VERSION,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    updatedAt,
    config,
  }
  return JSON.stringify(snapshot, null, 2)
}

export function parseAndValidateConfigSnapshot(
  text: string,
): { ok: true; snapshot: WebdavConfigSnapshot } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err: any) {
    return { ok: false, error: err?.message || "Invalid JSON text" }
  }

  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Parsed JSON is not an object" }
  }

  const candidate = raw as Partial<WebdavConfigSnapshot>
  if (
    candidate.format !== CONFIG_SNAPSHOT_FORMAT ||
    candidate.version !== CONFIG_SNAPSHOT_VERSION
  ) {
    return { ok: false, error: "Unrecognized config snapshot format" }
  }
  if (!candidate.config || typeof candidate.config !== "object") {
    return { ok: false, error: "Missing or invalid 'config' field" }
  }
  if (typeof candidate.schemaVersion !== "number" || !Number.isInteger(candidate.schemaVersion)) {
    return { ok: false, error: "Missing or invalid 'schemaVersion' field" }
  }

  return {
    ok: true,
    snapshot: {
      format: CONFIG_SNAPSHOT_FORMAT,
      version: CONFIG_SNAPSHOT_VERSION,
      schemaVersion: candidate.schemaVersion,
      updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
      config: candidate.config,
    },
  }
}

interface LocalConfigState {
  value: Config
  lastModifiedAt: number
}

/**
 * Local preferences plus their last-modified stamp. A missing or invalid stored
 * config degrades to defaults with a zero stamp, so any remote config wins.
 */
async function readLocalConfigForSync(): Promise<LocalConfigState> {
  const [stored, meta] = await Promise.all([
    storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`),
    storage.getMeta<ConfigMeta>(`local:${CONFIG_STORAGE_KEY}`),
  ])
  const parsed = stored ? configSchema.safeParse(stored) : null
  return {
    value: parsed?.success ? parsed.data : DEFAULT_CONFIG,
    lastModifiedAt: typeof meta?.lastModifiedAt === "number" ? meta.lastModifiedAt : 0,
  }
}

type RemoteConfigFetch =
  | { ok: true; snapshot: WebdavConfigSnapshot | null; etag: string | null }
  | { ok: false; error: WebdavError }

/**
 * Downloads the remote config snapshot. A 404 is not an error: it means the user
 * never synced preferences from this device yet, so the local config is uploaded.
 */
async function fetchRemoteConfigSnapshot(
  fileUrl: string,
  authHeader: string,
  fetchFn: typeof fetch,
): Promise<RemoteConfigFetch> {
  let res: Response
  try {
    res = await fetchFn(fileUrl, {
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
        message: err?.message || "Network error fetching remote config file",
        retryable: true,
      },
    }
  }

  if (res.status === 404) {
    return { ok: true, snapshot: null, etag: null }
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

  let text: string
  try {
    text = await res.text()
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || "Failed to read remote config response body",
        retryable: true,
      },
    }
  }

  const validation = parseAndValidateConfigSnapshot(text)
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
    snapshot: validation.snapshot,
    etag: res.headers.get("etag") ?? res.headers.get("ETag"),
  }
}

/**
 * Replaces local preferences with the newer remote ones. The current local config
 * is snapshotted into the backup history first, so an unwanted download stays
 * rollback-able from the config backup UI.
 */
async function applyRemoteConfigSnapshot(
  remote: WebdavConfigSnapshot,
  localConfig: Config,
  options?: SyncConfigWithWebdavOptions,
): Promise<ConfigSyncResult> {
  let migratedConfig: Config
  try {
    migratedConfig = await migrateConfig(remote.config, remote.schemaVersion)
  } catch (err: any) {
    if (err instanceof ConfigVersionTooNewError) {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_VERSION",
          message: err?.message || "Remote config schema version is not supported",
          retryable: false,
        },
      }
    }
    return {
      ok: false,
      error: {
        code: "CORRUPTED_REMOTE",
        message: err?.message || "Failed to migrate remote config",
        retryable: false,
      },
    }
  }

  try {
    await addBackup(localConfig, EXTENSION_VERSION)
    // Writing `local:config` is the broadcast: every context watching that key
    // (options page, context menu, translation queues, i18n) re-reads it.
    await setLocalConfigAndMeta(migratedConfig, {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      // Keep the remote stamp locally so the next sync sees both sides equal
      // instead of re-uploading the config it just downloaded.
      lastModifiedAt: remote.updatedAt,
    })
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "STORAGE_ERROR",
        message: err?.message || "Failed to apply remote config locally",
        retryable: true,
      },
    }
  }

  logger.info("[WebDAV] Remote config applied, previous config backed up locally")
  await options?.onConfigApplied?.(migratedConfig)

  return { ok: true, action: "downloaded", backupCreated: true }
}

/**
 * Synchronizes extension preferences with the user's WebDAV server using a
 * Last-Modified-Wins reconciliation on `lastModifiedAt`:
 * - remote newer  → back the local config up, then download and apply it
 * - local newer   → upload the local config
 * - neither newer → nothing to do
 */
export async function syncConfigWithWebdav(
  webdavConfig: WebdavConfig,
  options?: SyncConfigWithWebdavOptions,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<ConfigSyncResult> {
  let fileUrl: string
  try {
    fileUrl = getWebdavConfigFileUrl(webdavConfig.endpoint)
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

  const authHeader = getWebdavAuthHeader(webdavConfig.username, webdavConfig.password)
  const maxRetries = options?.maxRetries ?? MAX_CONFIG_SYNC_RETRIES
  let attempt = 0
  let createdParentCollection = false

  while (attempt < maxRetries) {
    attempt++

    // 1. Download the remote config summary
    const remote = await fetchRemoteConfigSnapshot(fileUrl, authHeader, fetchFn)
    if (!remote.ok) {
      return { ok: false, error: remote.error }
    }

    let local: LocalConfigState
    try {
      local = await readLocalConfigForSync()
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "STORAGE_ERROR",
          message: err?.message || "Failed to read local config",
          retryable: true,
        },
      }
    }

    // 2. Remote newer: replace the local config (with a local snapshot first)
    if (remote.snapshot && remote.snapshot.updatedAt > local.lastModifiedAt) {
      return await applyRemoteConfigSnapshot(remote.snapshot, local.value, options)
    }

    // 3. Local and remote already agree: skip the upload entirely
    if (remote.snapshot && dequal(local.value, remote.snapshot.config)) {
      return { ok: true, action: "no-change" }
    }

    // 4. Local newer (or no remote file yet): upload the local config
    const uploadBody = exportConfigSnapshot(local.value, local.lastModifiedAt)
    const putHeaders: Record<string, string> = {
      Authorization: authHeader,
      "Content-Type": "application/json; charset=utf-8",
    }
    if (!remote.snapshot) {
      putHeaders["If-None-Match"] = "*"
    } else if (remote.etag) {
      const trimmedEtag = remote.etag.trim()
      putHeaders["If-Match"] =
        trimmedEtag.startsWith('"') || trimmedEtag.startsWith("W/")
          ? trimmedEtag
          : `"${trimmedEtag}"`
    }

    let putRes: Response
    try {
      putRes = await fetchFn(fileUrl, {
        method: "PUT",
        headers: putHeaders,
        body: uploadBody,
      })
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: err?.message || "Failed to upload config to WebDAV",
          retryable: true,
        },
      }
    }

    if (putRes.status === 412) {
      // Remote config changed concurrently on another device: re-read and reconcile
      logger.info("[WebDAV] Config precondition failed (412), retrying sync...")
      continue
    }

    if (putRes.status === 401 || putRes.status === 403) {
      return {
        ok: false,
        error: {
          code: "AUTH_FAILED",
          message: "Authentication failed during config upload",
          retryable: false,
        },
      }
    }

    if (putRes.status === 400 || putRes.status === 501) {
      return {
        ok: false,
        error: {
          code: "CONDITION_NOT_SUPPORTED",
          message: "WebDAV server does not support conditional PUT headers",
          retryable: false,
        },
      }
    }

    if (putRes.status === 200 || putRes.status === 201 || putRes.status === 204) {
      return { ok: true, action: "uploaded" }
    }

    if ((putRes.status === 404 || putRes.status === 409) && !createdParentCollection) {
      const parentUrl = getWebdavParentCollectionUrl(fileUrl)
      if (parentUrl) {
        createdParentCollection = true
        logger.info(
          `[WebDAV] Parent collection missing (HTTP ${putRes.status}), attempting MKCOL: ${parentUrl}`,
        )
        try {
          await fetchFn(parentUrl, {
            method: "MKCOL",
            headers: { Authorization: authHeader },
          })
        } catch (mkcolErr) {
          logger.warn("[WebDAV] Failed to execute MKCOL on parent collection", mkcolErr)
        }
        attempt-- // Collection creation does not consume a sync attempt
        continue
      }
    }

    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: `WebDAV server returned HTTP ${putRes.status} on config upload`,
        retryable: true,
      },
    }
  }

  return {
    ok: false,
    error: {
      code: "CONDITION_FAILED_MAX_RETRIES",
      message: `Config sync exceeded retry limit of ${maxRetries}`,
      retryable: true,
    },
  }
}
