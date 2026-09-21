import type { LocalDictionaryRepository } from "./repository"
import type {
  WebdavConfig,
  WebdavConfigSyncReport,
  WebdavErrorCode,
  WebdavSyncResult,
  WebdavSyncState,
} from "./types"
import { browser } from "#imports"
import { logger } from "@/utils/logger"
import {
  getStoredWebdavConfig,
  getStoredWebdavSyncState,
  saveStoredWebdavSyncState,
  syncConfigComponent,
  syncWithWebdav,
} from "./webdav"

export const WEBDAV_SYNC_ALARM_NAME = "readfrog-webdav-sync"
export const DEFAULT_DEBOUNCE_MS = 1500
export const INITIAL_BACKOFF_MS = 2000 // 2s
export const MAX_BACKOFF_MS = 60000 // 60s
export const MAX_AUTO_RETRIES = 5

export const UNRECOVERABLE_ERROR_CODES: Set<WebdavErrorCode> = new Set([
  "AUTH_FAILED",
  "CORRUPTED_REMOTE",
  "UNSUPPORTED_VERSION",
  "INTEGRITY_CONFLICT",
  "BUDGET_EXCEEDED",
  "CONDITION_NOT_SUPPORTED",
  "PERMISSION_DENIED",
])

export function calculateExponentialBackoff(
  retryCount: number,
  baseMs: number = INITIAL_BACKOFF_MS,
  maxMs: number = MAX_BACKOFF_MS,
): number {
  const backoff = baseMs * Math.pow(2, Math.max(0, retryCount))
  return Math.min(backoff, maxMs)
}

/**
 * Sync-state patch for the config component of a pass. A failed config sync
 * keeps the previous success timestamp: the last pass that actually worked is
 * still the honest answer to "when did my settings last sync".
 */
function configSyncStatePatch(report?: WebdavConfigSyncReport): Partial<WebdavSyncState> {
  if (!report) return {}
  if (!report.ok) {
    return {
      configSyncStatus: "failed",
      configLastError: report.error ?? null,
    }
  }
  return {
    configSyncStatus: "synced",
    configLastSuccessTime: Date.now(),
    configLastAction: report.action ?? null,
    configLastError: null,
  }
}

export class WebdavSyncEngine {
  private isRunning = false
  private hasPendingSync = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private backoffTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly getRepository: () => LocalDictionaryRepository,
    private readonly options?: {
      debounceMs?: number
      baseBackoffMs?: number
      maxBackoffMs?: number
      maxAutoRetries?: number
      fetchFn?: typeof fetch
      onStateChange?: (state: WebdavSyncState) => void
      onLocalUpdated?: () => Promise<void> | void
      syncReviews?: boolean
    },
  ) {}

  /**
   * Called when local database changes occur (debounced auto sync)
   */
  scheduleDebouncedSync(delayMs: number = this.options?.debounceMs ?? DEFAULT_DEBOUNCE_MS): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.triggerSync({ reason: "debounce" })
    }, delayMs)
  }

  /**
   * Main entry point to trigger a sync task.
   */
  async triggerSync(triggerOptions?: {
    reason?: "debounce" | "startup" | "online" | "alarm" | "manual" | "retry"
    forceUnconditional?: boolean
    resetPaused?: boolean
    /** Reconcile only extension preferences (`readbuddy-config.json`). */
    onlyConfig?: boolean
  }): Promise<WebdavSyncResult | null> {
    // Mutex: Synchronously check and set isRunning before any async await
    if (this.isRunning) {
      // A preferences-only request is subsumed by the pass already running —
      // that pass reconciles preferences too — so it must not queue a full
      // pass behind it, or clicking "Sync Preferences" would sync the
      // dictionary as a side effect.
      this.hasPendingSync = this.hasPendingSync || !triggerOptions?.onlyConfig
      return null
    }

    this.isRunning = true

    try {
      const config = await getStoredWebdavConfig()
      if (!config) {
        logger.info("[WebdavSyncEngine] Skipping sync: no WebDAV configuration")
        return null
      }

      // A preferences-only pass is an explicit user action from the WebDAV
      // detail page. It runs before the pause check on purpose: pausing the
      // engine is about the dictionary component, and the preference component
      // deliberately stays non-fatal (ADR 0003 decision 6).
      if (triggerOptions?.onlyConfig) {
        return await this.runConfigOnlyPass(config)
      }

      const currentState = await getStoredWebdavSyncState()

      // If currently paused, only manual sync or explicit reset can unpause
      if (currentState.phase === "paused") {
        if (!triggerOptions?.resetPaused && triggerOptions?.reason !== "manual") {
          logger.info(
            `[WebdavSyncEngine] Skipping sync: engine is paused (${currentState.pausedReason})`,
          )
          return null
        }
      }

      // Guard: forceUnconditional is only allowed when previously paused due to CONDITION_NOT_SUPPORTED
      const isForceUnconditional =
        Boolean(triggerOptions?.forceUnconditional) &&
        currentState.pausedReason === "CONDITION_NOT_SUPPORTED"

      // Clear any active timers
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
        this.debounceTimer = null
      }
      if (this.backoffTimer) {
        clearTimeout(this.backoffTimer)
        this.backoffTimer = null
      }

      const repo = this.getRepository()
      let pendingCount = 0
      try {
        pendingCount = await repo.getPendingSyncChangesCount()
      } catch {
        // ignore
      }

      // Update state to syncing
      const syncingState = await saveStoredWebdavSyncState({
        phase: "syncing",
        lastAttemptTime: Date.now(),
        pendingChangesCount: pendingCount,
        pausedReason:
          triggerOptions?.resetPaused || triggerOptions?.reason === "manual"
            ? null
            : currentState.pausedReason,
        lastError:
          triggerOptions?.resetPaused || triggerOptions?.reason === "manual"
            ? null
            : currentState.lastError,
      })
      this.options?.onStateChange?.(syncingState)

      let result: WebdavSyncResult
      try {
        result = await syncWithWebdav(
          repo,
          config,
          {
            forceUnconditional: isForceUnconditional,
            syncReviews: this.options?.syncReviews ?? false,
          },
          this.options?.fetchFn,
        )
      } catch (err: any) {
        result = {
          ok: false,
          error: {
            code: "NETWORK_ERROR",
            message: err?.message || "Unexpected sync error",
            retryable: true,
          },
        }
      }

      // Refresh pending changes count
      try {
        pendingCount = await repo.getPendingSyncChangesCount()
      } catch {
        // ignore
      }

      if (result.ok) {
        if (result.localUpdated) {
          try {
            await this.options?.onLocalUpdated?.()
          } catch {
            // ignore
          }
        }
        // Sync succeeded! Reset backoff and errors
        const successState = await saveStoredWebdavSyncState({
          phase: "idle",
          lastSuccessTime: Date.now(),
          nextRetryTime: null,
          retryCount: 0,
          pendingChangesCount: pendingCount,
          lastError: null,
          pausedReason: null,
          ...(result.components?.reviews?.ok ? { reviewsLastSuccessTime: Date.now() } : {}),
          ...configSyncStatePatch(result.components?.config),
        })
        this.options?.onStateChange?.(successState)

        // Cancel any browser alarm
        try {
          if (browser?.alarms?.clear) {
            await browser.alarms.clear(WEBDAV_SYNC_ALARM_NAME)
          }
        } catch {
          // ignore
        }

        return result
      }

      // Sync failed: check error
      const err = result.error!
      const isUnrecoverable = UNRECOVERABLE_ERROR_CODES.has(err.code)

      if (isUnrecoverable) {
        // Unrecoverable / paused error (auth failed, corrupted, unsupported version, etc.)
        const pausedState = await saveStoredWebdavSyncState({
          phase: "paused",
          pausedReason: err.code,
          lastError: err,
          nextRetryTime: null,
          pendingChangesCount: pendingCount,
        })
        this.options?.onStateChange?.(pausedState)
        try {
          if (browser?.alarms?.clear) {
            await browser.alarms.clear(WEBDAV_SYNC_ALARM_NAME)
          }
        } catch {
          // ignore
        }
        return result
      }

      // Recoverable error: retry with exponential backoff
      const nextRetryCount = currentState.retryCount + 1
      const maxRetries = this.options?.maxAutoRetries ?? MAX_AUTO_RETRIES

      if (nextRetryCount > maxRetries) {
        // Max auto retries reached: report error and pause auto-retries
        const errorState = await saveStoredWebdavSyncState({
          phase: "error",
          lastError: err,
          pausedReason: err.code,
          nextRetryTime: null,
          retryCount: nextRetryCount,
          pendingChangesCount: pendingCount,
        })
        this.options?.onStateChange?.(errorState)
        try {
          if (browser?.alarms?.clear) {
            await browser.alarms.clear(WEBDAV_SYNC_ALARM_NAME)
          }
        } catch {
          // ignore
        }
        return result
      }

      const backoffMs = calculateExponentialBackoff(
        nextRetryCount,
        this.options?.baseBackoffMs ?? INITIAL_BACKOFF_MS,
        this.options?.maxBackoffMs ?? MAX_BACKOFF_MS,
      )
      const nextRetryTime = Date.now() + backoffMs

      const retryState = await saveStoredWebdavSyncState({
        phase: "error",
        lastError: err,
        retryCount: nextRetryCount,
        nextRetryTime,
        pendingChangesCount: pendingCount,
      })
      this.options?.onStateChange?.(retryState)

      // Schedule timer
      this.backoffTimer = setTimeout(() => {
        this.backoffTimer = null
        void this.triggerSync({ reason: "retry" })
      }, backoffMs)

      // Also register browser alarm for cross-Service-Worker recovery
      try {
        if (browser?.alarms?.create) {
          const delayInMinutes = Math.max(0.1, backoffMs / (60 * 1000))
          void browser.alarms.create(WEBDAV_SYNC_ALARM_NAME, {
            delayInMinutes,
          })
        }
      } catch {
        // ignore
      }

      return result
    } finally {
      this.isRunning = false

      // If pending changes occurred while running, trigger another pass
      if (this.hasPendingSync) {
        this.hasPendingSync = false
        void this.triggerSync({ reason: "debounce" })
      }
    }
  }

  /**
   * Reconciles only the preference component (`readbuddy-config.json`), for the
   * WebDAV detail page's independent trigger. The dictionary and review files
   * are left alone, and only the preference fields of the sync state are
   * written — so this pass can neither make the learning data look freshly
   * synced nor pause the engine when the preferences fail.
   */
  private async runConfigOnlyPass(config: WebdavConfig): Promise<WebdavSyncResult> {
    const report = await syncConfigComponent(config, this.options?.fetchFn)
    const state = await saveStoredWebdavSyncState(configSyncStatePatch(report))
    this.options?.onStateChange?.(state)
    return {
      ok: report.ok,
      error: report.error,
      components: { config: report },
    }
  }

  /**
   * Restores state upon Service Worker start or network recovery
   */
  async restoreAndCheckSchedule(): Promise<void> {
    const config = await getStoredWebdavConfig()
    if (!config) return

    const state = await getStoredWebdavSyncState()

    // If was syncing when worker died, reset to idle/error so it doesn't stay stuck
    if (state.phase === "syncing") {
      await saveStoredWebdavSyncState({ phase: "idle" })
    }

    if (state.phase === "paused") {
      return
    }

    // If in error phase and retries exceeded (nextRetryTime is null), do not auto-restart
    if (state.phase === "error" && !state.nextRetryTime) {
      return
    }

    if (state.nextRetryTime && state.nextRetryTime > Date.now()) {
      // Still within backoff window: schedule remaining timer
      const remainingMs = Math.max(100, state.nextRetryTime - Date.now())
      if (this.backoffTimer) clearTimeout(this.backoffTimer)
      this.backoffTimer = setTimeout(() => {
        this.backoffTimer = null
        void this.triggerSync({ reason: "retry" })
      }, remainingMs)
      return
    }

    // Otherwise, trigger startup sync
    void this.triggerSync({ reason: "startup" })
  }
}
