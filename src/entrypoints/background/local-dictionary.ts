import { storage } from "#imports"
import { getLocalDictionaryDb } from "@/utils/local-dictionary/db"
import { LocalDictionaryRepository } from "@/utils/local-dictionary/repository"
import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"

export const DICTIONARY_CHANGE_SIGNAL_KEY = "local:dictionaryChangeSignal"

let repositoryInstance: LocalDictionaryRepository | null = null

function getRepository(): LocalDictionaryRepository {
  if (!repositoryInstance) {
    repositoryInstance = new LocalDictionaryRepository(getLocalDictionaryDb())
  }
  return repositoryInstance
}

async function notifyChange(): Promise<void> {
  try {
    await storage.setItem<number>(DICTIONARY_CHANGE_SIGNAL_KEY, Date.now())
  } catch (error) {
    logger.warn("[LocalDictionary] Failed to broadcast dictionaryChangeSignal", error)
  }
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
}
