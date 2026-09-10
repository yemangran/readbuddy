import type { RemoteSnapshotSummary, WebdavErrorCode } from "@/utils/local-dictionary/types"
import { Icon } from "@iconify/react"
import { useQuery } from "@tanstack/react-query"
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
import { toastManager } from "@/components/ui/base-ui/toast"
import { ConfigDetailSection } from "@/entrypoints/options/components/config-detail-section"
import { PageLayout } from "@/entrypoints/options/components/page-layout"
import { i18n, type I18nKey } from "@/utils/i18n"
import {
  clearWebdavConfig,
  getRemoteWebdavSummary,
  getWebdavConfig,
  getWebdavSyncState,
  saveWebdavConfig,
  testWebdavConnection,
  triggerWebdavSync,
  watchWebdavSyncState,
} from "@/utils/local-dictionary/client"
import { requestWebdavHostPermission } from "@/utils/local-dictionary/webdav"
import { cn } from "@/utils/styles/utils"
import { queryClient } from "@/utils/tanstack-query"

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

export function WebdavSyncPage() {
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

  useEffect(() => {
    const handleOnline = () => {
      void triggerWebdavSync({ reason: "online" })
    }
    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("online", handleOnline)
    }
  }, [])

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
        resetPaused: options?.resetPaused,
      })
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
      title={i18n.t("options.preference.title")}
      description={i18n.t("options.preference.pageDescription")}
    >
      <ConfigDetailSection backTo="/preference" title={i18n.t("options.dictionary.webdav.title")}>
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
                      syncState.phase === "idle"
                        ? "default"
                        : syncState.phase === "paused" || syncState.phase === "error"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {syncState.phase === "idle" && i18n.t("options.dictionary.webdav.phaseIdle")}
                    {syncState.phase === "syncing" &&
                      i18n.t("options.dictionary.webdav.phaseSyncing")}
                    {syncState.phase === "paused" &&
                      i18n.t("options.dictionary.webdav.phasePaused")}
                    {syncState.phase === "error" && i18n.t("options.dictionary.webdav.phaseError")}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-muted-foreground md:grid-cols-4">
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
                      {syncState.pendingChangesCount}
                    </span>
                  </div>
                  {syncState.nextRetryTime && (
                    <div className="col-span-2">
                      <span>{i18n.t("options.dictionary.webdav.nextRetry")}: </span>
                      <span className="font-medium text-foreground">
                        {Math.max(0, Math.ceil((syncState.nextRetryTime - currentTime) / 1000))}s
                      </span>
                    </div>
                  )}
                </div>

                {syncState.pausedReason && (
                  <div className="mt-2 space-y-1.5 border-t pt-2">
                    <div className="text-destructive">
                      {getWebdavErrorMessage(syncState.lastError, syncState.pausedReason)}
                    </div>
                    <div className="flex items-center gap-2">
                      {syncState.pausedReason === "CONDITION_NOT_SUPPORTED" && (
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={handleOpenForceOverwrite}
                          aria-label="webdav-force-overwrite"
                        >
                          {i18n.t("options.dictionary.webdav.forceOverwriteConfirm")}
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleSyncWebdav({ resetPaused: true })}
                        disabled={isSyncingWebdav}
                        aria-label="webdav-retry-now"
                      >
                        <Icon
                          icon="tabler:refresh"
                          className={cn("mr-1 size-3.5", isSyncingWebdav && "animate-spin")}
                        />
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
                disabled={isSyncingWebdav || isFetchingRemoteSummary || !remoteSummary}
                aria-label="confirm-force-overwrite"
              >
                {i18n.t("options.dictionary.webdav.forceOverwriteConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ConfigDetailSection>
    </PageLayout>
  )
}
