import type {
  CommitImportInput,
  CommitImportOutput,
  CreateManyInput,
  DeleteInput,
  DictionaryReply,
  DictionarySnapshotV1,
  ImportPreviewResult,
  ListInput,
  ListOutput,
  LocalDictionaryRecord,
  PortableDictionaryRecord,
  PurgeInput,
  RemoteSnapshotSummary,
  RestoreConflictVersionInput,
  RestoreDeletedInput,
  UpdateCellsInput,
  WebdavConfig,
  WebdavError,
  WebdavSyncResult,
  WebdavSyncState,
} from "./types"
import { storage } from "#imports"
import { sendMessage } from "@/utils/message"

export const DICTIONARY_CHANGE_SIGNAL_STORAGE_KEY = "local:dictionaryChangeSignal"

export function isPortDisconnectionError(error: unknown): boolean {
  if (!error) return false
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : typeof error === "string"
          ? error
          : ""
  return (
    msg.includes("message port closed") ||
    msg.includes("Could not establish connection") ||
    msg.includes("Receiving end does not exist") ||
    msg.includes("No response") ||
    msg.includes("Extension context invalidated")
  )
}

export async function sendWithRetry<T>(
  action: () => Promise<DictionaryReply<T>> | Promise<any>,
  maxRetries = 2,
  baseDelayMs = 20,
): Promise<DictionaryReply<T>> {
  let attempt = 0
  while (true) {
    try {
      const reply = (await action()) as DictionaryReply<T>
      if (reply.ok || !reply.error?.retryable || attempt >= maxRetries) {
        return reply
      }
    } catch (err: any) {
      if (!isPortDisconnectionError(err) || attempt >= maxRetries) {
        return {
          ok: false,
          error: {
            code: "STORAGE_UNAVAILABLE",
            message: err?.message || "Communication port error",
            retryable: false,
          },
        }
      }
    }
    attempt++
    const delay = baseDelayMs * Math.pow(2, attempt - 1)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

export async function getDictionaryRecord(
  id: string,
): Promise<DictionaryReply<LocalDictionaryRecord>> {
  return await sendWithRetry(() => sendMessage("dictionaryGet", { id }))
}

export async function listDictionaryRecords(
  input?: ListInput,
): Promise<DictionaryReply<ListOutput>> {
  return await sendWithRetry(() => sendMessage("dictionaryList", input))
}

export async function createDictionaryRecords(
  input: CreateManyInput,
): Promise<DictionaryReply<{ createdIds: string[] }>> {
  return await sendWithRetry(() => sendMessage("dictionaryCreateMany", input))
}

export async function updateDictionaryCells(
  input: UpdateCellsInput,
): Promise<DictionaryReply<LocalDictionaryRecord>> {
  return await sendWithRetry(() => sendMessage("dictionaryUpdateCells", input))
}

export async function deleteDictionaryRecord(
  input: DeleteInput,
): Promise<DictionaryReply<{ id: string; deleted: boolean }>> {
  return await sendWithRetry(() => sendMessage("dictionaryDelete", input))
}

export async function getDictionaryMutationResult(
  requestId: string,
): Promise<DictionaryReply<unknown>> {
  return await sendWithRetry(() => sendMessage("dictionaryGetMutationResult", { requestId }))
}

export async function listConflictVersions(
  id: string,
): Promise<DictionaryReply<PortableDictionaryRecord[]>> {
  return await sendWithRetry(() => sendMessage("dictionaryListConflictVersions", { id }))
}

export async function restoreConflictVersionAsNew(
  input: RestoreConflictVersionInput,
): Promise<DictionaryReply<LocalDictionaryRecord>> {
  return await sendWithRetry(() => sendMessage("dictionaryRestoreAsNew", input))
}

export async function exportDictionarySnapshot(): Promise<DictionaryReply<string>> {
  return await sendWithRetry(() => sendMessage("dictionaryExportSnapshot"))
}

export async function restoreDeletedDictionaryRecord(
  input: RestoreDeletedInput,
): Promise<DictionaryReply<LocalDictionaryRecord>> {
  return await sendWithRetry(() => sendMessage("dictionaryRestoreDeleted", input))
}

export async function purgeDictionaryRecord(
  input: PurgeInput,
): Promise<DictionaryReply<{ id: string; purged: boolean }>> {
  return await sendWithRetry(() => sendMessage("dictionaryPurge", input))
}

export async function purgeAllDeletedDictionaryRecords(): Promise<
  DictionaryReply<{ purgedCount: number; purgedIds?: string[] }>
> {
  return await sendWithRetry(() => sendMessage("dictionaryPurgeAllDeleted"))
}

export async function previewDictionaryImport(
  snapshot: DictionarySnapshotV1,
): Promise<DictionaryReply<ImportPreviewResult>> {
  return await sendWithRetry(() => sendMessage("dictionaryPreviewImport", snapshot))
}

export async function commitDictionaryImport(
  input: CommitImportInput,
): Promise<DictionaryReply<CommitImportOutput>> {
  return await sendWithRetry(() => sendMessage("dictionaryCommitImport", input))
}

export function watchDictionaryChangeSignal(callback: () => void): () => void {
  return storage.watch<number>(DICTIONARY_CHANGE_SIGNAL_STORAGE_KEY, () => {
    callback()
  })
}

export async function getWebdavConfig(): Promise<WebdavConfig | null> {
  return await sendMessage("dictionaryGetWebdavConfig")
}

export async function saveWebdavConfig(config: WebdavConfig): Promise<{ ok: boolean }> {
  return await sendMessage("dictionarySaveWebdavConfig", config)
}

export async function clearWebdavConfig(): Promise<{ ok: boolean }> {
  return await sendMessage("dictionaryClearWebdavConfig")
}

export async function testWebdavConnection(
  config?: WebdavConfig,
): Promise<{ ok: boolean; error?: WebdavError }> {
  return await sendMessage("dictionaryTestWebdavConnection", config)
}

export async function syncWebdav(options?: {
  forceUnconditional?: boolean
}): Promise<WebdavSyncResult> {
  const res = await triggerWebdavSync({
    reason: "manual",
    forceUnconditional: options?.forceUnconditional,
    resetPaused: true,
  })
  return (
    res ?? {
      ok: false,
      error: {
        code: "AUTH_FAILED",
        message: "No WebDAV configuration found or sync skipped",
        retryable: false,
      },
    }
  )
}

export async function getWebdavSyncState(): Promise<WebdavSyncState> {
  return await sendMessage("dictionaryGetWebdavSyncState")
}

export async function triggerWebdavSync(options?: {
  forceUnconditional?: boolean
  resetPaused?: boolean
  /** Reconcile only extension preferences (`readbuddy-config.json`). */
  onlyConfig?: boolean
  reason?: "debounce" | "startup" | "online" | "alarm" | "manual" | "retry"
}): Promise<WebdavSyncResult | null> {
  return await sendMessage("dictionaryTriggerWebdavSync", options)
}

/**
 * Reconciles only extension preferences (`readbuddy-config.json`), leaving the
 * dictionary and review files untouched. The independent trigger of the WebDAV
 * detail page's preference sync overview.
 */
export async function syncWebdavConfig(): Promise<WebdavSyncResult | null> {
  return await triggerWebdavSync({ reason: "manual", onlyConfig: true })
}

export async function getRemoteWebdavSummary(): Promise<
  { ok: true; summary: RemoteSnapshotSummary } | { ok: false; error: WebdavError }
> {
  return await sendMessage("dictionaryGetRemoteWebdavSummary")
}

export function watchWebdavSyncState(
  callback: (state: WebdavSyncState | null) => void,
): () => void {
  return storage.watch<WebdavSyncState>("local:webdavSyncState", (newState) => {
    callback(newState)
  })
}
