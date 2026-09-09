import type {
  DictionarySnapshotV1,
  ImportPreviewResult,
  LocalDictionaryRecord,
  PortableDictionaryRecord,
  RemoteSnapshotSummary,
} from "@/utils/local-dictionary/types"
import type { WebdavErrorCode } from "@/utils/local-dictionary/types"
import { Icon } from "@iconify/react"
import { useQuery } from "@tanstack/react-query"
import { saveAs } from "file-saver"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/base-ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/base-ui/dialog"
import { Input } from "@/components/ui/base-ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/base-ui/table"
import { toastManager } from "@/components/ui/base-ui/toast"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { i18n, type I18nKey } from "@/utils/i18n"
import {
  clearWebdavConfig,
  commitDictionaryImport,
  deleteDictionaryRecord,
  exportDictionarySnapshot,
  getRemoteWebdavSummary,
  getWebdavConfig,
  getWebdavSyncState,
  listConflictVersions,
  listDictionaryRecords,
  previewDictionaryImport,
  restoreConflictVersionAsNew,
  saveWebdavConfig,
  testWebdavConnection,
  triggerWebdavSync,
  updateDictionaryCells,
  watchDictionaryChangeSignal,
  watchWebdavSyncState,
} from "@/utils/local-dictionary/client"
import { parseAndValidateSnapshot } from "@/utils/local-dictionary/snapshot"
import { requestWebdavHostPermission } from "@/utils/local-dictionary/webdav"
import { cn } from "@/utils/styles/utils"
import { queryClient } from "@/utils/tanstack-query"
import { PageLayout } from "../../components/page-layout"

const PAGE_SIZE = 15

const WEBDAV_ERROR_I18N_KEYS: Record<WebdavErrorCode, I18nKey> = {
  AUTH_FAILED: "options.dictionary.webdav.authFailed",
  CORRUPTED_REMOTE: "options.dictionary.webdav.corruptedRemote",
  UNSUPPORTED_VERSION: "options.dictionary.webdav.unsupportedVersion",
  INTEGRITY_CONFLICT: "options.dictionary.webdav.integrityConflict",
  BUDGET_EXCEEDED: "options.dictionary.webdav.budgetExceeded",
  CONDITION_FAILED_MAX_RETRIES: "options.dictionary.webdav.conditionRetryExceeded",
  CONDITION_NOT_SUPPORTED: "options.dictionary.webdav.conditionNotSupported",
  PERMISSION_DENIED: "options.dictionary.webdav.permissionDenied",
  STORAGE_ERROR: "options.dictionary.webdav.storageError",
  NETWORK_ERROR: "options.dictionary.webdav.networkError",
}

function getWebdavErrorMessage(
  error?: { code?: string; message?: string } | null,
  fallback?: string,
): string {
  if (!error) return fallback || ""
  if (error.code && error.code in WEBDAV_ERROR_I18N_KEYS) {
    const key = WEBDAV_ERROR_I18N_KEYS[error.code as WebdavErrorCode]
    return (i18n.t as (k: string) => string)(key)
  }
  return error.message || fallback || "Sync failed"
}

export function DictionaryPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")

  // Edit dialog state
  const [editingRecord, setEditingRecord] = useState<LocalDictionaryRecord | null>(null)
  const [editCells, setEditCells] = useState<Record<string, string | number | null>>({})
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete dialog state
  const [deletingRecord, setDeletingRecord] = useState<LocalDictionaryRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // History & conflicts dialog state
  const [historyRecord, setHistoryRecord] = useState<LocalDictionaryRecord | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  // Snapshot Export state
  const [isExporting, setIsExporting] = useState(false)

  // Snapshot Import dialog state
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importSnapshot, setImportSnapshot] = useState<DictionarySnapshotV1 | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  // WebDAV state
  const [webdavEndpoint, setWebdavEndpoint] = useState("")
  const [webdavUsername, setWebdavUsername] = useState("")
  const [webdavPassword, setWebdavPassword] = useState("")
  const [isWebdavConfigured, setIsWebdavConfigured] = useState(false)
  const [isTestingWebdav, setIsTestingWebdav] = useState(false)
  const [isSyncingWebdav, setIsSyncingWebdav] = useState(false)
  const [webdavError, setWebdavError] = useState<string | null>(null)
  const [isForceOverwriteDialogOpen, setIsForceOverwriteDialogOpen] = useState(false)
  const [isFetchingRemoteSummary, setIsFetchingRemoteSummary] = useState(false)
  const [remoteSummary, setRemoteSummary] = useState<RemoteSnapshotSummary | null>(null)

  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const { data: syncState } = useQuery({
    queryKey: ["local-dictionary-webdav-sync-state"],
    queryFn: async () => {
      return await getWebdavSyncState()
    },
    refetchInterval: 2000,
  })

  useEffect(() => {
    if (!syncState?.nextRetryTime) {
      return undefined
    }
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [syncState?.nextRetryTime])

  useEffect(() => {
    return watchWebdavSyncState(() => {
      void queryClient.invalidateQueries({ queryKey: ["local-dictionary-webdav-sync-state"] })
    })
  }, [])

  useEffect(() => {
    void getWebdavConfig().then((config) => {
      if (config?.endpoint && config?.username) {
        setWebdavEndpoint(config.endpoint)
        setWebdavUsername(config.username)
        setWebdavPassword(config.password || "")
        setIsWebdavConfigured(true)
      }
    })
  }, [])

  const { data, isPending } = useQuery({
    queryKey: ["local-dictionary-records", page, search],
    queryFn: async () => {
      const reply = await listDictionaryRecords({
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
      })
      if (!reply.ok) {
        throw new Error(reply.error.message || "Failed to load dictionary records")
      }
      return reply.data
    },
  })

  const historyRecordId = historyRecord?.id
  const { data: conflictVersions, isPending: isLoadingConflicts } = useQuery({
    queryKey: ["local-dictionary-conflicts", historyRecordId],
    enabled: Boolean(historyRecordId),
    queryFn: async () => {
      if (!historyRecordId) return []
      const reply = await listConflictVersions(historyRecordId)
      if (!reply.ok) {
        throw new Error(reply.error.message || "Failed to load conflict versions")
      }
      return reply.data
    },
  })

  useEffect(() => {
    return watchDictionaryChangeSignal(() => {
      void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      void queryClient.invalidateQueries({ queryKey: ["local-dictionary-conflicts"] })
    })
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      void triggerWebdavSync({ reason: "online" })
    }
    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  const records = data?.records ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleOpenEdit = (record: LocalDictionaryRecord) => {
    setEditingRecord(record)
    setEditCells({ ...record.cells })
  }

  const handleSaveEdit = async () => {
    if (!editingRecord) return
    setIsSavingEdit(true)
    try {
      const normalizedCells: Record<string, string | number | null> = {}
      for (const col of editingRecord.columns) {
        const val = editCells[col.id]
        if (val === undefined || val === null || val === "") {
          normalizedCells[col.id] = null
        } else if (
          col.config?.type === "number" ||
          typeof editingRecord.cells[col.id] === "number"
        ) {
          const num = Number(val)
          normalizedCells[col.id] = Number.isNaN(num) ? val : num
        } else {
          normalizedCells[col.id] = val
        }
      }

      const reply = await updateDictionaryCells({
        requestId: getRandomUUID(),
        id: editingRecord.id,
        cells: normalizedCells,
        expectedRevision: editingRecord.localRevision,
      })

      if (reply.ok) {
        setEditingRecord(null)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else {
        if (reply.error.code === "EDIT_CONFLICT") {
          toastManager.add({
            type: "error",
            title: i18n.t("options.dictionary.conflictWarning"),
          })
          void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
        } else {
          toastManager.add({
            type: "error",
            title: reply.error.message || "Failed to update record",
          })
        }
      }
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingRecord) return
    setIsDeleting(true)
    try {
      const reply = await deleteDictionaryRecord({
        requestId: getRandomUUID(),
        id: deletingRecord.id,
        expectedRevision: deletingRecord.localRevision,
      })

      if (reply.ok) {
        setDeletingRecord(null)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else {
        toastManager.add({
          type: "error",
          title: reply.error.message || "Failed to delete record",
        })
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await exportDictionarySnapshot()
      if (res.ok) {
        const blob = new Blob([res.data], { type: "application/json" })
        saveAs(blob, "readfrog.json")
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.exportSuccess"),
        })
      } else {
        toastManager.add({
          type: "error",
          title: res.error.message || "Failed to export snapshot",
        })
      }
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError(null)
    setImportPreview(null)
    setImportSnapshot(null)

    try {
      const text = await file.text()
      const parseResult = parseAndValidateSnapshot(text)
      if (!parseResult.ok) {
        setImportError(parseResult.error)
        return
      }

      setImportSnapshot(parseResult.snapshot)
      const previewRes = await previewDictionaryImport(parseResult.snapshot)
      if (!previewRes.ok) {
        setImportError(previewRes.error.message || "Preview failed")
        return
      }

      setImportPreview(previewRes.data)
      if (previewRes.data.errors.length > 0) {
        setImportError(previewRes.data.errors.join("; "))
      }
    } catch (err: any) {
      setImportError(err?.message || "Failed to read file")
    }
  }

  const handleConfirmImport = async () => {
    if (!importSnapshot || !importPreview) return
    setIsImporting(true)
    try {
      const reply = await commitDictionaryImport({
        requestId: getRandomUUID(),
        snapshot: importSnapshot,
        expectedSequence: importPreview.expectedSequence,
        snapshotHash: importPreview.snapshotHash,
      })

      if (reply.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.importSuccess"),
        })
        setIsImportOpen(false)
        setImportSnapshot(null)
        setImportPreview(null)
        setImportError(null)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else {
        if (reply.error.code === "EDIT_CONFLICT") {
          toastManager.add({
            type: "error",
            title: i18n.t("options.dictionary.importConflict"),
          })
          // Re-trigger preview
          const previewRes = await previewDictionaryImport(importSnapshot)
          if (previewRes.ok) {
            setImportPreview(previewRes.data)
          }
        } else {
          toastManager.add({
            type: "error",
            title: reply.error.message || "Failed to commit import",
          })
        }
      }
    } finally {
      setIsImporting(false)
    }
  }

  const handleRestoreConflict = async (conflict: PortableDictionaryRecord) => {
    setIsRestoring(true)
    try {
      const reply = await restoreConflictVersionAsNew({
        requestId: getRandomUUID(),
        versionId: {
          id: conflict.id,
          updatedAt: conflict.updatedAt,
          deviceId: conflict.deviceId,
        },
      })

      if (reply.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.restoreSuccess"),
        })
        setHistoryRecord(null)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else {
        toastManager.add({
          type: "error",
          title: reply.error.message || "Failed to restore version",
        })
      }
    } finally {
      setIsRestoring(false)
    }
  }

  const handleSaveWebdav = async () => {
    setWebdavError(null)
    const trimmedEndpoint = webdavEndpoint.trim()
    const trimmedUser = webdavUsername.trim()
    if (!trimmedEndpoint || !trimmedUser) return

    try {
      const hasPermission = await requestWebdavHostPermission(trimmedEndpoint)
      if (!hasPermission) {
        setWebdavError(i18n.t("options.dictionary.webdav.permissionDenied"))
        toastManager.add({
          type: "error",
          title: i18n.t("options.dictionary.webdav.permissionDenied"),
        })
        return
      }

      await saveWebdavConfig({
        endpoint: trimmedEndpoint,
        username: trimmedUser,
        password: webdavPassword,
      })
      setIsWebdavConfigured(true)
      toastManager.add({
        type: "success",
        title: i18n.t("options.dictionary.webdav.saveSuccess"),
      })
    } catch (err: any) {
      setWebdavError(err?.message || "Failed to save WebDAV settings")
    }
  }

  const handleTestWebdav = async () => {
    setIsTestingWebdav(true)
    setWebdavError(null)
    try {
      const reply = await testWebdavConnection({
        endpoint: webdavEndpoint.trim(),
        username: webdavUsername.trim(),
        password: webdavPassword,
      })
      if (reply.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.webdav.connected"),
        })
      } else {
        const msg = getWebdavErrorMessage(reply.error, "Connection failed")
        setWebdavError(msg)
        toastManager.add({
          type: "error",
          title: msg,
        })
      }
    } finally {
      setIsTestingWebdav(false)
    }
  }

  const handleSyncWebdav = async (options?: {
    forceUnconditional?: boolean
    resetPaused?: boolean
  }) => {
    setIsSyncingWebdav(true)
    setWebdavError(null)
    try {
      const reply = await triggerWebdavSync({
        reason: "manual",
        forceUnconditional: options?.forceUnconditional,
        resetPaused: options?.resetPaused ?? true,
      })
      void queryClient.invalidateQueries({ queryKey: ["local-dictionary-webdav-sync-state"] })
      if (reply?.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.webdav.syncSuccess"),
        })
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else if (reply && !reply.ok) {
        const msg = getWebdavErrorMessage(reply.error, "Sync failed")
        setWebdavError(msg)
        toastManager.add({
          type: "error",
          title: msg,
        })
      }
    } finally {
      setIsSyncingWebdav(false)
    }
  }

  const handleOpenForceOverwrite = async () => {
    setIsFetchingRemoteSummary(true)
    setIsForceOverwriteDialogOpen(true)
    setRemoteSummary(null)
    try {
      const res = await getRemoteWebdavSummary()
      if (res.ok) {
        setRemoteSummary(res.summary)
      } else {
        toastManager.add({
          type: "error",
          title: res.error.message || "Failed to inspect remote snapshot",
        })
      }
    } finally {
      setIsFetchingRemoteSummary(false)
    }
  }

  const handleConfirmForceOverwrite = async () => {
    setIsForceOverwriteDialogOpen(false)
    await handleSyncWebdav({ forceUnconditional: true, resetPaused: true })
  }

  const handleDisconnectWebdav = async () => {
    await clearWebdavConfig()
    setWebdavEndpoint("")
    setWebdavUsername("")
    setWebdavPassword("")
    setIsWebdavConfigured(false)
    setWebdavError(null)
    toastManager.add({
      type: "success",
      title: i18n.t("options.dictionary.webdav.disconnectSuccess"),
    })
  }

  return (
    <PageLayout
      title={i18n.t("options.dictionary.title")}
      description={i18n.t("options.dictionary.pageDescription")}
      innerClassName="flex flex-col gap-6"
    >
      {/* WebDAV Synchronization Section */}
      <Card className="border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon icon="tabler:cloud-upload" className="size-5 text-primary" />
              {i18n.t("options.dictionary.webdav.title")}
              <Badge variant={isWebdavConfigured ? "default" : "secondary"} className="text-xs">
                {isWebdavConfigured
                  ? i18n.t("options.dictionary.webdav.connected")
                  : i18n.t("options.dictionary.webdav.notConfigured")}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              {i18n.t("options.dictionary.webdav.description")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isWebdavConfigured && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSyncWebdav()}
                  disabled={isSyncingWebdav}
                  aria-label="webdav-sync-now"
                >
                  <Icon
                    icon="tabler:refresh"
                    className={cn("mr-1.5 size-4", isSyncingWebdav && "animate-spin")}
                  />
                  {isSyncingWebdav
                    ? i18n.t("options.dictionary.webdav.syncing")
                    : i18n.t("options.dictionary.webdav.syncNow")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDisconnectWebdav}
                  className="text-destructive hover:bg-destructive/10"
                  aria-label="webdav-disconnect"
                >
                  {i18n.t("options.dictionary.webdav.disconnect")}
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {i18n.t("options.dictionary.webdav.endpoint")}
              </label>
              <Input
                placeholder={i18n.t("options.dictionary.webdav.endpointPlaceholder")}
                value={webdavEndpoint}
                onChange={(e) => setWebdavEndpoint(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {i18n.t("options.dictionary.webdav.username")}
              </label>
              <Input
                placeholder="username"
                value={webdavUsername}
                onChange={(e) => setWebdavUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {i18n.t("options.dictionary.webdav.password")}
              </label>
              <Input
                type="password"
                placeholder={isWebdavConfigured ? "••••••••" : "password"}
                value={webdavPassword}
                onChange={(e) => setWebdavPassword(e.target.value)}
              />
            </div>
          </div>

          {isWebdavConfigured && syncState && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
              <div className="flex items-center justify-between font-semibold text-foreground">
                <span className="flex items-center gap-1.5">
                  <Icon icon="tabler:activity" className="size-4 text-primary" />
                  {i18n.t("options.dictionary.webdav.status")}
                </span>
                <Badge
                  variant={
                    syncState.phase === "syncing"
                      ? "default"
                      : syncState.phase === "paused"
                        ? "destructive"
                        : syncState.phase === "error"
                          ? "outline"
                          : "secondary"
                  }
                  className="text-xs uppercase"
                >
                  {syncState.phase === "syncing" &&
                    i18n.t("options.dictionary.webdav.phaseSyncing")}
                  {syncState.phase === "paused" && i18n.t("options.dictionary.webdav.phasePaused")}
                  {syncState.phase === "error" && i18n.t("options.dictionary.webdav.phaseError")}
                  {syncState.phase === "idle" && i18n.t("options.dictionary.webdav.phaseIdle")}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-4">
                <div>
                  <span>{i18n.t("options.dictionary.webdav.lastSuccess")}: </span>
                  <span className="font-medium text-foreground">
                    {syncState.lastSuccessTime
                      ? new Date(syncState.lastSuccessTime).toLocaleTimeString()
                      : i18n.t("options.dictionary.webdav.neverSynced")}
                  </span>
                </div>
                <div>
                  <span>{i18n.t("options.dictionary.webdav.pendingChanges")}: </span>
                  <span className="font-medium text-foreground">
                    {syncState.pendingChangesCount ?? 0}
                  </span>
                </div>
                <div>
                  <span>{i18n.t("options.dictionary.webdav.nextRetry")}: </span>
                  <span className="font-medium text-foreground">
                    {syncState.nextRetryTime && syncState.nextRetryTime > currentTime
                      ? `${Math.ceil((syncState.nextRetryTime - currentTime) / 1000)}s`
                      : "-"}
                  </span>
                </div>
                {syncState.retryCount > 0 && (
                  <div>
                    <span>Retries: </span>
                    <span className="font-medium text-foreground">{syncState.retryCount}</span>
                  </div>
                )}
              </div>

              {(syncState.phase === "paused" || syncState.phase === "error") && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-destructive">
                    {getWebdavErrorMessage(
                      syncState.lastError ||
                        (syncState.pausedReason ? { code: syncState.pausedReason } : null),
                      syncState.lastError?.message || syncState.pausedReason || undefined,
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {syncState.pausedReason === "CONDITION_NOT_SUPPORTED" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleOpenForceOverwrite}
                        disabled={isSyncingWebdav}
                        aria-label="webdav-force-overwrite"
                      >
                        {i18n.t("options.dictionary.webdav.forceOverwriteConfirm")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSyncWebdav({ resetPaused: true })}
                      disabled={isSyncingWebdav}
                      aria-label="webdav-retry-sync"
                    >
                      <Icon icon="tabler:reload" className="mr-1 size-3.5" />
                      {i18n.t("options.dictionary.webdav.retryNow")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {webdavError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <div className="font-semibold">Error</div>
              <div>{webdavError}</div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestWebdav}
              disabled={isTestingWebdav || !webdavEndpoint || !webdavUsername}
              aria-label="webdav-test-connection"
            >
              <Icon
                icon="tabler:plug"
                className={cn("mr-1.5 size-4", isTestingWebdav && "animate-spin")}
              />
              {isTestingWebdav
                ? i18n.t("options.dictionary.webdav.testing")
                : i18n.t("options.dictionary.webdav.testConnection")}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveWebdav}
              disabled={
                !webdavEndpoint || !webdavUsername || (!webdavPassword && !isWebdavConfigured)
              }
              aria-label="webdav-save-settings"
            >
              <Icon icon="tabler:device-floppy" className="mr-1.5 size-4" />
              {i18n.t("options.dictionary.webdav.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Input
            placeholder={i18n.t("options.dictionary.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            aria-label="export-snapshot"
          >
            <Icon icon="tabler:download" className="mr-1.5 size-4" />
            {i18n.t("options.dictionary.export")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setImportSnapshot(null)
              setImportPreview(null)
              setImportError(null)
              setIsImportOpen(true)
            }}
            aria-label="import-snapshot"
          >
            <Icon icon="tabler:upload" className="mr-1.5 size-4" />
            {i18n.t("options.dictionary.import")}
          </Button>
        </div>
      </div>

      {/* Records Table */}
      <div className="rounded-lg border bg-card">
        {records.length === 0 && !isPending ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Icon icon="tabler:book-off" className="mb-3 size-10 text-muted-foreground/60" />
            <h3 className="text-base font-medium text-foreground">
              {i18n.t("options.dictionary.emptyTitle")}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {i18n.t("options.dictionary.emptyDescription")}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[45%]">
                  {i18n.t("options.dictionary.columns.cells")}
                </TableHead>
                <TableHead className="w-[20%]">
                  {i18n.t("options.dictionary.columns.action")}
                </TableHead>
                <TableHead className="w-[20%]">
                  {i18n.t("options.dictionary.columns.updatedAt")}
                </TableHead>
                <TableHead className="w-[15%] text-right">
                  {i18n.t("options.dictionary.edit")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record, index) => {
                const cellEntries = Object.entries(record.cells).filter(
                  ([, val]) => val !== null && val !== undefined && val !== "",
                )

                return (
                  <TableRow key={record.id} index={index}>
                    <TableCell className="py-3 align-top">
                      <div className="space-y-1">
                        {cellEntries.slice(0, 3).map(([colId, val]) => {
                          const col = record.columns.find((c) => c.id === colId)
                          const label = col?.name || colId
                          return (
                            <div key={colId} className="text-xs">
                              <span className="mr-1 font-semibold text-muted-foreground">
                                {label}:
                              </span>
                              <span className="text-foreground">{String(val)}</span>
                            </div>
                          )
                        })}
                        {cellEntries.length > 3 && (
                          <span className="text-[11px] text-muted-foreground">
                            +{cellEntries.length - 3} more fields
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 align-top">
                      <Badge variant="secondary" className="text-xs">
                        {record.actionName}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 align-top text-xs text-muted-foreground">
                      {new Date(record.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3 text-right align-top">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="history-record"
                          title={i18n.t("options.dictionary.history")}
                          onClick={() => setHistoryRecord(record)}
                        >
                          <Icon icon="tabler:history" className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="edit-record"
                          title={i18n.t("options.dictionary.edit")}
                          onClick={() => handleOpenEdit(record)}
                        >
                          <Icon icon="tabler:edit" className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="delete-record"
                          title={i18n.t("options.dictionary.delete")}
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingRecord(record)}
                        >
                          <Icon icon="tabler:trash" className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {page} / {totalPages} (total: {total})
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit Record Dialog */}
      <Dialog
        open={Boolean(editingRecord)}
        onOpenChange={(open) => !open && setEditingRecord(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.editTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto py-2">
            {editingRecord?.columns.map((col) => (
              <div key={col.id} className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">{col.name}</label>
                <Input
                  type={col.config?.type === "number" ? "number" : "text"}
                  value={String(editCells[col.id] ?? "")}
                  onChange={(e) =>
                    setEditCells((prev) => ({
                      ...prev,
                      [col.id]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingRecord(null)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit}>
              {i18n.t("options.dictionary.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Record Dialog */}
      <Dialog
        open={Boolean(deletingRecord)}
        onOpenChange={(open) => !open && setDeletingRecord(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {i18n.t("options.dictionary.deleteConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeletingRecord(null)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
              {i18n.t("options.dictionary.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History & Conflict Versions Dialog */}
      <Dialog
        open={Boolean(historyRecord)}
        onOpenChange={(open) => !open && setHistoryRecord(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.historyTitle")}</DialogTitle>
            <DialogDescription>{i18n.t("options.dictionary.historyDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-2">
            {isLoadingConflicts ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Loading...</div>
            ) : !conflictVersions || conflictVersions.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {i18n.t("options.dictionary.historyEmpty")}
              </div>
            ) : (
              conflictVersions.map((version) => (
                <div
                  key={`${version.id}-${version.updatedAt}-${version.deviceId}`}
                  className="flex items-start justify-between rounded-md border p-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <span>{new Date(version.updatedAt).toLocaleString()}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {version.deviceId}
                      </Badge>
                      {version.deletedAt && (
                        <Badge variant="destructive" className="text-[10px]">
                          Tombstone
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-0.5 text-muted-foreground">
                      {Object.entries(version.cells).map(([colId, val]) => {
                        const col = version.columns.find((c) => c.id === colId)
                        return (
                          <div key={colId}>
                            <span className="font-semibold">{col?.name || colId}:</span>{" "}
                            {String(val ?? "")}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={isRestoring}
                    onClick={() => handleRestoreConflict(version)}
                  >
                    <Icon icon="tabler:arrow-back-up" className="mr-1 size-3.5" />
                    {i18n.t("options.dictionary.restoreAsNew")}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHistoryRecord(null)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snapshot Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.importTitle")}</DialogTitle>
            <DialogDescription>{i18n.t("options.dictionary.importDescription")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <input
              type="file"
              accept=".json"
              aria-label="snapshot-file-input"
              className="text-xs text-muted-foreground file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
              onChange={handleFileChange}
            />

            {importError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <div className="font-semibold">{i18n.t("options.dictionary.previewErrors")}</div>
                <div className="mt-1">{importError}</div>
              </div>
            )}

            {importPreview && !importError && (
              <div className="rounded-md border bg-muted/30 p-4">
                <h4 className="mb-3 text-xs font-semibold text-foreground">
                  {i18n.t("options.dictionary.preview")}
                </h4>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewAdded")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.addedCount}
                    </span>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewUpdated")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.updatedCount}
                    </span>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewDeleted")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.deletedCount}
                    </span>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewPreserved")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.addedConflictCount}
                    </span>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewUnchanged")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.unchangedCount}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsImportOpen(false)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmImport}
              disabled={
                isImporting ||
                !importPreview ||
                Boolean(importError) ||
                importPreview.errors.length > 0
              }
            >
              {i18n.t("options.dictionary.confirmImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Overwrite Confirmation Dialog */}
      <Dialog open={isForceOverwriteDialogOpen} onOpenChange={setIsForceOverwriteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Icon icon="tabler:alert-triangle" className="size-5" />
              {i18n.t("options.dictionary.webdav.forceOverwriteTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {i18n.t("options.dictionary.webdav.forceOverwriteDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-3 text-xs">
            <div className="font-semibold text-foreground">
              {i18n.t("options.dictionary.webdav.remoteSummaryTitle")}
            </div>
            {isFetchingRemoteSummary ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon icon="tabler:loader-2" className="size-4 animate-spin" />
                <span>Loading...</span>
              </div>
            ) : remoteSummary ? (
              remoteSummary.exists ? (
                <div className="grid grid-cols-2 gap-2 rounded border bg-muted/40 p-2.5">
                  <div>
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.webdav.remoteRecords")}:{" "}
                    </span>
                    <span className="font-medium">{remoteSummary.recordCount ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.webdav.remoteConflicts")}:{" "}
                    </span>
                    <span className="font-medium">{remoteSummary.conflictCount ?? 0}</span>
                  </div>
                  {remoteSummary.updatedAt && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">
                        {i18n.t("options.dictionary.webdav.remoteUpdatedAt")}:{" "}
                      </span>
                      <span className="font-medium">
                        {new Date(remoteSummary.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-muted-foreground">
                  {i18n.t("options.dictionary.webdav.remoteNotExists")}
                </div>
              )
            ) : (
              <div className="text-muted-foreground">No remote summary available</div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsForceOverwriteDialogOpen(false)}
            >
              {i18n.t("options.dictionary.cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirmForceOverwrite}
              disabled={isSyncingWebdav}
              aria-label="confirm-force-overwrite"
            >
              {i18n.t("options.dictionary.webdav.forceOverwriteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
