import { browser, storage } from "#imports"
import { getLocalDictionaryDb } from "@/utils/local-dictionary/db"
import { LocalDictionaryRepository } from "@/utils/local-dictionary/repository"
import { WebdavSyncEngine, WEBDAV_SYNC_ALARM_NAME } from "@/utils/local-dictionary/sync-engine"
import {
  clearStoredWebdavConfig,
  fetchRemoteSnapshotSummary,
  getStoredWebdavConfig,
  getStoredWebdavSyncState,
  saveStoredWebdavConfig,
  syncWithWebdav,
  testWebdavConnection,
} from "@/utils/local-dictionary/webdav"
import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"

export const DICTIONARY_CHANGE_SIGNAL_KEY = "local:dictionaryChangeSignal"

let repositoryInstance: LocalDictionaryRepository | null = null
let syncEngineInstance: WebdavSyncEngine | null = null

export function getRepository(): LocalDictionaryRepository {
  if (!repositoryInstance) {
    repositoryInstance = new LocalDictionaryRepository(getLocalDictionaryDb())
  }
  return repositoryInstance
}

export function getSyncEngine(): WebdavSyncEngine {
  if (!syncEngineInstance) {
    syncEngineInstance = new WebdavSyncEngine(() => getRepository())
  }
  return syncEngineInstance
}

async function notifyChange(): Promise<void> {
  try {
    await storage.setItem<number>(DICTIONARY_CHANGE_SIGNAL_KEY, Date.now())
  } catch (error) {
    logger.warn("[LocalDictionary] Failed to broadcast dictionaryChangeSignal", error)
  }
  // Schedule debounced background WebDAV sync on local changes
  try {
    getSyncEngine().scheduleDebouncedSync()
  } catch (error) {
    logger.warn("[LocalDictionary] Failed to schedule debounced sync", error)
  }
}

export function setupLocalDictionarySyncEngine(): void {
  const engine = getSyncEngine()

  // Register alarm listener for WebDAV sync retries across SW restarts
  if (browser?.alarms?.onAlarm) {
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === WEBDAV_SYNC_ALARM_NAME) {
        void engine.triggerSync({ reason: "alarm" })
      }
    })
  }

  // Network online listener if available in execution environment
  if (typeof globalThis !== "undefined" && "addEventListener" in globalThis) {
    globalThis.addEventListener("online", () => {
      void engine.triggerSync({ reason: "online" })
    })
  }

  // Check state and restore schedule upon service worker startup
  void engine.restoreAndCheckSchedule()
}

export function setupLocalDictionaryMessageHandlers(): void {
  onMessage("dictionaryGet", async (message) => {
    const repo = getRepository()
    return await repo.get(message.data.id)
  })

  onMessage("dictionaryList", async (message) => {
    const repo = getRepository()
    return await repo.list(message.data)
  })

  onMessage("dictionaryCreateMany", async (message) => {
    const repo = getRepository()
    const result = await repo.createMany(message.data)
    if (result.ok) {
      await notifyChange()
    }
    return result
  })

  onMessage("dictionaryUpdateCells", async (message) => {
    const repo = getRepository()
    const result = await repo.updateCells(message.data)
    if (result.ok) {
      await notifyChange()
    }
    return result
  })

  onMessage("dictionaryDelete", async (message) => {
    const repo = getRepository()
    const result = await repo.delete(message.data)
    if (result.ok) {
      await notifyChange()
    }
    return result
  })

  onMessage("dictionaryGetMutationResult", async (message) => {
    const repo = getRepository()
    return await repo.getMutationResult(message.data.requestId)
  })

  onMessage("dictionaryListConflictVersions", async (message) => {
    const repo = getRepository()
    return await repo.listConflictVersions(message.data.id)
  })

  onMessage("dictionaryRestoreAsNew", async (message) => {
    const repo = getRepository()
    const result = await repo.restoreConflictVersionAsNew(message.data)
    if (result.ok) {
      await notifyChange()
    }
    return result
  })

  onMessage("dictionaryExportSnapshot", async () => {
    const repo = getRepository()
    return await repo.exportSnapshot()
  })

  onMessage("dictionaryPreviewImport", async (message) => {
    const repo = getRepository()
    return await repo.previewImport(message.data)
  })

  onMessage("dictionaryCommitImport", async (message) => {
    const repo = getRepository()
    const result = await repo.commitImport(message.data)
    if (result.ok) {
      await notifyChange()
    }
    return result
  })

  onMessage("dictionaryGetWebdavConfig", async () => {
    return await getStoredWebdavConfig()
  })

  onMessage("dictionarySaveWebdavConfig", async (message) => {
    await saveStoredWebdavConfig(message.data)
    // When WebDAV config is newly saved, trigger a background sync pass
    void getSyncEngine().triggerSync({ reason: "manual", resetPaused: true })
    return { ok: true }
  })

  onMessage("dictionaryClearWebdavConfig", async () => {
    await clearStoredWebdavConfig()
    return { ok: true }
  })

  onMessage("dictionaryTestWebdavConnection", async (message) => {
    const config = message.data || (await getStoredWebdavConfig())
    if (!config) {
      return {
        ok: false,
        error: {
          code: "AUTH_FAILED" as const,
          message: "No WebDAV configuration provided",
          retryable: false,
        },
      }
    }
    return await testWebdavConnection(config)
  })

  onMessage("dictionarySyncWebdav", async (message) => {
    const config = await getStoredWebdavConfig()
    if (!config) {
      return {
        ok: false,
        error: {
          code: "AUTH_FAILED" as const,
          message: "No WebDAV configuration found. Please configure WebDAV settings first.",
          retryable: false,
        },
      }
    }
    const repo = getRepository()
    const result = await syncWithWebdav(repo, config, message.data)
    if (result.ok && result.localUpdated) {
      await notifyChange()
    }
    return result
  })

  onMessage("dictionaryGetWebdavSyncState", async () => {
    return await getStoredWebdavSyncState()
  })

  onMessage("dictionaryTriggerWebdavSync", async (message) => {
    const engine = getSyncEngine()
    return await engine.triggerSync({
      reason: message.data?.reason ?? "manual",
      forceUnconditional: message.data?.forceUnconditional,
      resetPaused: message.data?.resetPaused,
    })
  })

  onMessage("dictionaryGetRemoteWebdavSummary", async () => {
    const config = await getStoredWebdavConfig()
    if (!config) {
      return {
        ok: false as const,
        error: {
          code: "AUTH_FAILED" as const,
          message: "No WebDAV configuration found",
          retryable: false,
        },
      }
    }
    return await fetchRemoteSnapshotSummary(config)
  })
}
