import type { RemoteSnapshotSummary } from "@/utils/local-dictionary/types"
import { Icon } from "@iconify/react"
import { useEffect, useRef, useState } from "react"
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
import { i18n } from "@/utils/i18n"
import {
  clearWebdavConfig,
  getRemoteWebdavSummary,
  getWebdavConfig,
  saveWebdavConfig,
  syncWebdavConfig,
  testWebdavConnection,
  triggerWebdavSync,
} from "@/utils/local-dictionary/client"
import { requestWebdavHostPermission } from "@/utils/local-dictionary/webdav"
import { cn } from "@/utils/styles/utils"
import { queryClient } from "@/utils/tanstack-query"
import { WebdavConfigSyncOverview } from "./components/config-sync-overview"
import { WebdavSetupGuideDialog } from "./components/webdav-setup-guide-dialog"
import { useWebdavSyncState } from "./use-webdav-sync-state"
import { getWebdavErrorMessage } from "./webdav-error-message"

export function WebdavSyncPage() {
  const [webdavEndpoint, setWebdavEndpoint] = useState("")
  const [webdavUsername, setWebdavUsername] = useState("")
  const [webdavPassword, setWebdavPassword] = useState("")
  const [isWebdavConfigured, setIsWebdavConfigured] = useState(false)
  const [isTestingWebdav, setIsTestingWebdav] = useState(false)
  const [isSyncingWebdav, setIsSyncingWebdav] = useState(false)
  const [isSyncingConfig, setIsSyncingConfig] = useState(false)
  const [webdavError, setWebdavError] = useState<string | null>(null)
  const [isForceOverwriteDialogOpen, setIsForceOverwriteDialogOpen] = useState(false)
  const [isFetchingRemoteSummary, setIsFetchingRemoteSummary] = useState(false)
  const [remoteSummary, setRemoteSummary] = useState<RemoteSnapshotSummary | null>(null)
  const [isViewingRemoteSummary, setIsViewingRemoteSummary] = useState(false)
  const [isFetchingInlineSummary, setIsFetchingInlineSummary] = useState(false)
  const [remoteSummaryInline, setRemoteSummaryInline] = useState<RemoteSnapshotSummary | null>(null)
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [savedConfig, setSavedConfig] = useState<{ endpoint: string; username: string } | null>(
    null,
  )
  const usernameInputRef = useRef<HTMLInputElement>(null)

  const canEdit = !isWebdavConfigured || isEditing

  const handleApplyJianguoyunPreset = () => {
    setWebdavEndpoint("https://dav.jianguoyun.com/dav/")
    toastManager.add({
      type: "info",
      title: i18n.t("options.dictionary.webdav.jianguoyunPresetApplied"),
      description: i18n.t("options.dictionary.webdav.jianguoyunPresetAppliedDesc"),
    })
    usernameInputRef.current?.focus()
  }

  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const syncState = useWebdavSyncState()

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
    void getWebdavConfig().then((config) => {
      if (config?.endpoint && config?.username) {
        setWebdavEndpoint(config.endpoint)
        setWebdavUsername(config.username)
        setWebdavPassword(config.password || "")
        setIsWebdavConfigured(true)
        setSavedConfig({ endpoint: config.endpoint, username: config.username })
        setIsEditing(false)
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
      setIsEditing(false)
      setSavedConfig({ endpoint: trimmedEndpoint, username: trimmedUser })
      setWebdavPassword("")
      toastManager.add({
        type: "success",
        title: i18n.t("options.dictionary.webdav.saveSuccess"),
        description: i18n.t("options.dictionary.webdav.saveSuccessDesc"),
      })
    } catch (err: any) {
      setWebdavError(err?.message || "Failed to save WebDAV settings")
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    if (savedConfig) {
      setWebdavEndpoint(savedConfig.endpoint)
      setWebdavUsername(savedConfig.username)
      setWebdavPassword("")
    }
    setWebdavError(null)
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
          description: i18n.t("options.dictionary.webdav.connectedDesc"),
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

  /**
   * Independent trigger for the preference component: reconciles
   * `readbuddy-config.json` alone, leaving the dictionary and review files to
   * the global "Sync Now" above.
   */
  const handleSyncConfig = async () => {
    setIsSyncingConfig(true)
    setWebdavError(null)
    try {
      const reply = await syncWebdavConfig()
      if (reply?.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.webdav.configSyncSuccess"),
        })
      } else if (reply) {
        const msg = getWebdavErrorMessage(
          reply.error,
          i18n.t("options.dictionary.webdav.networkError"),
        )
        setWebdavError(msg)
        toastManager.add({
          type: "error",
          title: msg,
        })
      } else {
        // The engine was busy: the pass already running covers preferences too.
        toastManager.add({
          type: "info",
          title: i18n.t("options.dictionary.webdav.syncInProgress"),
        })
      }
    } finally {
      setIsSyncingConfig(false)
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

  const handleToggleViewRemoteSummary = async () => {
    if (isViewingRemoteSummary) {
      setIsViewingRemoteSummary(false)
      return
    }
    setIsViewingRemoteSummary(true)
    setIsFetchingInlineSummary(true)
    try {
      const res = await getRemoteWebdavSummary()
      if (res.ok) {
        setRemoteSummaryInline(res.summary)
      } else {
        toastManager.add({
          type: "error",
          title: res.error.message || "Failed to inspect remote snapshot",
        })
      }
    } finally {
      setIsFetchingInlineSummary(false)
    }
  }

  const handleDisconnectWebdav = async () => {
    await clearWebdavConfig()
    setWebdavEndpoint("")
    setWebdavUsername("")
    setWebdavPassword("")
    setIsWebdavConfigured(false)
    setSavedConfig(null)
    setIsEditing(false)
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
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsSetupGuideOpen(true)}
                aria-label="view-setup-guide"
              >
                <Icon icon="tabler:book-2" className="mr-1.5 size-4" />
                {i18n.t("options.dictionary.webdav.viewSetupGuide")}
              </Button>
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
                  disabled={!canEdit}
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
                  ref={usernameInputRef}
                  disabled={!canEdit}
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
                  disabled={!canEdit}
                  placeholder={
                    isWebdavConfigured
                      ? i18n.t("options.dictionary.webdav.passwordKeepPlaceholder")
                      : "password"
                  }
                  value={webdavPassword}
                  onChange={(e) => setWebdavPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium">快捷设置:</span>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="h-6 text-[11px]"
                onClick={handleApplyJianguoyunPreset}
                disabled={!canEdit}
                aria-label="preset-jianguoyun"
              >
                <Icon icon="tabler:cloud" className="mr-1 size-3 text-primary" />
                {i18n.t("options.dictionary.webdav.presetJianguoyun")}
              </Button>
            </div>

            {isWebdavConfigured && syncState && (
              <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <span className="flex items-center gap-1.5">
                    <Icon icon="tabler:activity" className="size-4 text-primary" />
                    {i18n.t("options.dictionary.webdav.status")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={handleToggleViewRemoteSummary}
                      disabled={isFetchingInlineSummary}
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Icon
                        icon={isViewingRemoteSummary ? "tabler:chevron-up" : "tabler:cloud-search"}
                        className={cn("mr-1 size-3", isFetchingInlineSummary && "animate-spin")}
                      />
                      {isViewingRemoteSummary
                        ? i18n.t("options.dictionary.webdav.hideRemoteSnapshot")
                        : i18n.t("options.dictionary.webdav.viewRemoteSnapshot")}
                    </Button>
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
                      {syncState.phase === "error" &&
                        i18n.t("options.dictionary.webdav.phaseError")}
                    </Badge>
                  </div>
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
                    <span>{i18n.t("options.dictionary.webdav.reviewsLastSuccess")}: </span>
                    <span className="font-medium text-foreground">
                      {syncState.reviewsLastSuccessTime
                        ? new Date(syncState.reviewsLastSuccessTime).toLocaleTimeString()
                        : i18n.t("options.dictionary.webdav.neverSynced")}
                    </span>
                  </div>
                  <div>
                    <span>{i18n.t("options.dictionary.webdav.pendingChanges")}: </span>
                    {syncState.pendingChangesCount === 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                        <Icon icon="tabler:check" className="size-3" />0 (
                        {i18n.t("options.dictionary.webdav.allSynced")})
                      </span>
                    ) : (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {syncState.pendingChangesCount}
                      </span>
                    )}
                  </div>
                  {syncState.nextRetryTime && (
                    <div>
                      <span>{i18n.t("options.dictionary.webdav.nextRetry")}: </span>
                      <span className="font-medium text-foreground">
                        {Math.max(0, Math.ceil((syncState.nextRetryTime - currentTime) / 1000))}s
                      </span>
                    </div>
                  )}
                </div>

                {isViewingRemoteSummary && (
                  <div className="mt-2 space-y-1.5 rounded border bg-background/50 p-2.5 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{i18n.t("options.dictionary.webdav.remoteSummaryTitle")}</span>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={handleToggleViewRemoteSummary}
                        className="h-5 px-1.5 text-[10px]"
                      >
                        <Icon icon="tabler:x" className="size-3" />
                      </Button>
                    </div>
                    {isFetchingInlineSummary ? (
                      <div className="flex items-center gap-2 py-1 text-muted-foreground">
                        <Icon icon="tabler:loader-2" className="size-3.5 animate-spin" />
                        <span>Loading...</span>
                      </div>
                    ) : remoteSummaryInline ? (
                      remoteSummaryInline.exists ? (
                        <div className="grid grid-cols-2 gap-2 text-muted-foreground md:grid-cols-3">
                          <div>
                            <span>{i18n.t("options.dictionary.webdav.remoteRecords")}: </span>
                            <span className="font-medium text-foreground">
                              {remoteSummaryInline.recordCount ?? 0}
                            </span>
                          </div>
                          <div>
                            <span>{i18n.t("options.dictionary.webdav.remoteConflicts")}: </span>
                            <span className="font-medium text-foreground">
                              {remoteSummaryInline.conflictCount ?? 0}
                            </span>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <span>{i18n.t("options.dictionary.webdav.remoteUpdatedAt")}: </span>
                            <span className="font-medium text-foreground">
                              {remoteSummaryInline.updatedAt
                                ? new Date(remoteSummaryInline.updatedAt).toLocaleTimeString()
                                : "-"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-1 text-muted-foreground">
                          {i18n.t("options.dictionary.webdav.remoteNotExists")}
                        </div>
                      )
                    ) : null}
                  </div>
                )}

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

            {/* Preference component of the unified sync, with its own trigger */}
            {isWebdavConfigured && syncState && (
              <WebdavConfigSyncOverview
                state={syncState}
                // A pass already running covers preferences too, so the
                // independent trigger waits for it instead of racing it.
                isSyncing={isSyncingConfig || isSyncingWebdav || syncState.phase === "syncing"}
                onSync={() => void handleSyncConfig()}
              />
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

              {isWebdavConfigured && !isEditing ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  aria-label="webdav-edit-settings"
                >
                  <Icon icon="tabler:edit" className="mr-1.5 size-4" />
                  {i18n.t("options.dictionary.webdav.edit")}
                </Button>
              ) : (
                <>
                  {isWebdavConfigured && isEditing && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEdit}
                      aria-label="webdav-cancel-edit"
                    >
                      {i18n.t("options.dictionary.webdav.cancelEdit")}
                    </Button>
                  )}
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
                </>
              )}
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

        {/* WebDAV Multi-Vendor Setup Guide Dialog */}
        <WebdavSetupGuideDialog open={isSetupGuideOpen} onOpenChange={setIsSetupGuideOpen} />
      </ConfigDetailSection>
    </PageLayout>
  )
}
