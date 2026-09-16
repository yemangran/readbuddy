import type { ReviewState } from "./types"
import type { WebdavConfig, WebdavError } from "@/utils/local-dictionary/types"
import {
  getWebdavAuthHeader,
  getWebdavParentCollectionUrl,
  normalizeWebdavEndpoint,
  WEBDAV_DICTIONARY_FILENAME,
} from "@/utils/local-dictionary/webdav"
import { reviewStore, type createReviewStore } from "./store"

export const REVIEWS_SNAPSHOT_FORMAT = "readfrog-reviews"
export const REVIEWS_SNAPSHOT_VERSION = 1
export const REVIEWS_REMOTE_FILENAME = "readbuddy-reviews.json"

export interface ReviewsSnapshotV1 {
  format: "readfrog-reviews"
  version: 1
  updatedAt: number
  reviews: Record<string, ReviewState>
}

export function getWebdavReviewsFileUrl(endpoint: string): string {
  const normalized = normalizeWebdavEndpoint(endpoint)
  const url = new URL(normalized)
  if (url.pathname.endsWith(`/${WEBDAV_DICTIONARY_FILENAME}`)) {
    url.pathname = url.pathname.replace(
      new RegExp(`/${WEBDAV_DICTIONARY_FILENAME}$`),
      `/${REVIEWS_REMOTE_FILENAME}`,
    )
    return url.toString()
  }
  if (url.pathname.endsWith(`/${REVIEWS_REMOTE_FILENAME}`)) {
    return url.toString()
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/"
  }
  url.pathname += REVIEWS_REMOTE_FILENAME
  return url.toString()
}

export function exportReviewsSnapshot(reviews: Record<string, ReviewState>): string {
  const snapshot: ReviewsSnapshotV1 = {
    format: REVIEWS_SNAPSHOT_FORMAT,
    version: REVIEWS_SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    reviews,
  }
  return JSON.stringify(snapshot, null, 2)
}

export function parseAndValidateReviewsSnapshot(
  text: string,
): { ok: true; snapshot: ReviewsSnapshotV1 } | { ok: false; error: string } {
  try {
    const raw = JSON.parse(text)
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Parsed JSON is not an object" }
    }

    // Standard envelope format
    if (raw.format === REVIEWS_SNAPSHOT_FORMAT) {
      if (raw.version !== REVIEWS_SNAPSHOT_VERSION) {
        return { ok: false, error: `Unsupported reviews format version: ${raw.version}` }
      }
      if (!raw.reviews || typeof raw.reviews !== "object") {
        return { ok: false, error: "Missing or invalid 'reviews' field" }
      }
      return {
        ok: true,
        snapshot: {
          format: REVIEWS_SNAPSHOT_FORMAT,
          version: REVIEWS_SNAPSHOT_VERSION,
          updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
          reviews: raw.reviews as Record<string, ReviewState>,
        },
      }
    }

    // Fallback: raw Record<string, ReviewState> map
    const isValidMap = Object.values(raw).every(
      (v) => v && typeof v === "object" && typeof (v as any).recordId === "string",
    )
    if (isValidMap) {
      return {
        ok: true,
        snapshot: {
          format: REVIEWS_SNAPSHOT_FORMAT,
          version: REVIEWS_SNAPSHOT_VERSION,
          updatedAt: Date.now(),
          reviews: raw as Record<string, ReviewState>,
        },
      }
    }

    return { ok: false, error: "Unrecognized reviews snapshot format" }
  } catch (err: any) {
    return { ok: false, error: err?.message || "Invalid JSON text" }
  }
}

export interface ReconcileReviewsOptions {
  validRecordIds?: Iterable<string>
}

export interface ReconcileReviewsResult {
  merged: Record<string, ReviewState>
  localChanged: boolean
  remoteNeedsUpdate: boolean
}

export function reconcileReviewStates(
  local: Record<string, ReviewState>,
  remote: Record<string, ReviewState>,
  options?: ReconcileReviewsOptions,
): ReconcileReviewsResult {
  const validSet = options?.validRecordIds ? new Set(options.validRecordIds) : null
  const merged: Record<string, ReviewState> = {}

  let localChanged = false
  let remoteNeedsUpdate = false

  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)])

  for (const id of allKeys) {
    // If validRecordIds is provided, skip orphaned/purged records
    if (validSet && !validSet.has(id)) {
      if (local[id]) localChanged = true
      if (remote[id]) remoteNeedsUpdate = true
      continue
    }

    const localState = local[id]
    const remoteState = remote[id]

    if (localState && !remoteState) {
      merged[id] = localState
      remoteNeedsUpdate = true
    } else if (!localState && remoteState) {
      merged[id] = remoteState
      localChanged = true
    } else if (localState && remoteState) {
      // Last-Review-Wins comparison
      const localTime = localState.lastReview ?? 0
      const remoteTime = remoteState.lastReview ?? 0

      if (remoteTime > localTime) {
        merged[id] = remoteState
        localChanged = true
      } else if (localTime > remoteTime) {
        merged[id] = localState
        remoteNeedsUpdate = true
      } else {
        // Equal lastReview: compare reps, then due, then pick local
        if (remoteState.reps > localState.reps) {
          merged[id] = remoteState
          localChanged = true
        } else if (localState.reps > remoteState.reps) {
          merged[id] = localState
          remoteNeedsUpdate = true
        } else if (remoteState.due > localState.due) {
          merged[id] = remoteState
          localChanged = true
        } else {
          merged[id] = localState
          // Check if remote had different values
          if (JSON.stringify(localState) !== JSON.stringify(remoteState)) {
            remoteNeedsUpdate = true
          }
        }
      }
    }
  }

  return {
    merged,
    localChanged,
    remoteNeedsUpdate,
  }
}

export interface SyncReviewsOptions {
  maxRetries?: number
  forceUnconditional?: boolean
  validRecordIds?: Iterable<string>
}

export interface SyncReviewsResult {
  ok: boolean
  remoteUploaded?: boolean
  localUpdated?: boolean
  etag?: string | null
  error?: WebdavError
}

export async function syncReviewsWithWebdav(
  config: WebdavConfig,
  options?: SyncReviewsOptions,
  fetchFn: typeof fetch = globalThis.fetch,
  store: ReturnType<typeof createReviewStore> = reviewStore,
): Promise<SyncReviewsResult> {
  let fileUrl: string
  try {
    fileUrl = getWebdavReviewsFileUrl(config.endpoint)
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || "Invalid WebDAV endpoint URL for reviews",
        retryable: false,
      },
    }
  }

  const authHeader = getWebdavAuthHeader(config.username, config.password)
  const maxRetries = options?.maxRetries ?? 3
  let attempt = 0
  let createdParentCollection = false

  while (attempt < maxRetries) {
    attempt++

    // 1. Fetch remote reviews snapshot
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
          message: err?.message || "Network error fetching remote reviews file",
          retryable: true,
        },
      }
    }

    if (getRes.status === 401 || getRes.status === 403) {
      return {
        ok: false,
        error: {
          code: "AUTH_FAILED",
          message: "Authentication failed. Invalid WebDAV credentials.",
          retryable: false,
        },
      }
    }

    let remoteExists: boolean
    let remoteEtag: string | null
    let remoteReviews: Record<string, ReviewState>

    if (getRes.status === 404) {
      remoteExists = false
      remoteEtag = null
      remoteReviews = {}
    } else if (getRes.status === 200) {
      remoteExists = true
      remoteEtag = getRes.headers.get("etag") || getRes.headers.get("ETag")

      let text: string
      try {
        text = await getRes.text()
      } catch (err: any) {
        return {
          ok: false,
          error: {
            code: "NETWORK_ERROR",
            message: err?.message || "Failed to read reviews response body",
            retryable: true,
          },
        }
      }

      const validation = parseAndValidateReviewsSnapshot(text)
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
      remoteReviews = validation.snapshot.reviews
    } else {
      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: `Unexpected HTTP status ${getRes.status} from WebDAV server for reviews`,
          retryable: true,
        },
      }
    }

    // 2. Load local reviews and reconcile via LWW
    const localReviews = await store.getAllStates()
    const { merged, localChanged, remoteNeedsUpdate } = reconcileReviewStates(
      localReviews,
      remoteReviews,
      { validRecordIds: options?.validRecordIds },
    )

    // 3. Update local store if needed
    let localUpdated = false
    if (localChanged) {
      // Direct replacement with merged map:
      // Remove obsolete keys from store first if any
      const toRemove = Object.keys(localReviews).filter((k) => !merged[k])
      if (toRemove.length > 0) {
        await store.purgeReviewStates(toRemove)
      }
      for (const state of Object.values(merged)) {
        // Save state directly
        await store.getState(state.recordId) // ensure state initialization
      }
      // Save full merged states map
      await (store as any).purgeReviewStates?.([]) // No-op to trigger driver access
      const statesRecord = await store.getAllStates()
      for (const [k, v] of Object.entries(merged)) {
        statesRecord[k] = v
      }
      // Since store driver is encapsulated, we can write all states back
      // Let's ensure reviewStore has a clean helper or save
      await store.saveAllStates(merged)
      localUpdated = true
    }

    // 4. Check if remote upload is required
    const needsUpload = remoteNeedsUpdate || !remoteExists
    if (!needsUpload) {
      return {
        ok: true,
        remoteUploaded: false,
        localUpdated,
        etag: remoteEtag,
      }
    }

    // 5. Upload merged reviews to remote WebDAV
    const uploadBody = exportReviewsSnapshot(merged)
    const putHeaders: Record<string, string> = {
      Authorization: authHeader,
      "Content-Type": "application/json; charset=utf-8",
    }

    if (!options?.forceUnconditional) {
      if (remoteExists && remoteEtag) {
        const trimmed = remoteEtag.trim()
        putHeaders["If-Match"] =
          trimmed.startsWith('"') || trimmed.startsWith("W/") ? trimmed : `"${trimmed}"`
      } else {
        putHeaders["If-None-Match"] = "*"
      }
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
        localUpdated,
        error: {
          code: "NETWORK_ERROR",
          message: err?.message || "Failed to upload reviews to WebDAV",
          retryable: true,
        },
      }
    }

    if (putRes.status === 412) {
      // Precondition Failed: remote changed concurrently, retry
      continue
    }

    if (putRes.status === 401 || putRes.status === 403) {
      return {
        ok: false,
        localUpdated,
        error: {
          code: "AUTH_FAILED",
          message: "Authentication failed during reviews upload",
          retryable: false,
        },
      }
    }

    if (putRes.status === 200 || putRes.status === 201 || putRes.status === 204) {
      const newEtag = putRes.headers.get("etag") || putRes.headers.get("ETag")
      return {
        ok: true,
        remoteUploaded: true,
        localUpdated,
        etag: newEtag || remoteEtag,
      }
    }

    if ((putRes.status === 404 || putRes.status === 409) && !createdParentCollection) {
      const parentUrl = getWebdavParentCollectionUrl(fileUrl)
      if (parentUrl) {
        createdParentCollection = true
        try {
          await fetchFn(parentUrl, {
            method: "MKCOL",
            headers: { Authorization: authHeader },
          })
        } catch {
          // ignore
        }
        continue
      }
    }

    return {
      ok: false,
      localUpdated,
      error: {
        code: "STORAGE_ERROR",
        message: `WebDAV server returned HTTP ${putRes.status} during reviews upload`,
        retryable: true,
      },
    }
  }

  return {
    ok: false,
    error: {
      code: "CONDITION_NOT_SUPPORTED",
      message: "Exceeded maximum retry attempts for reviews sync",
      retryable: false,
    },
  }
}
