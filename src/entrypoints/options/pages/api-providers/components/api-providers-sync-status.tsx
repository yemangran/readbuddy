import { Icon } from "@iconify/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { toastManager } from "@/components/ui/base-ui/toast"
import { DRILL_IN_LOCATION_STATE } from "@/entrypoints/options/navigation/drill-in"
import { i18n } from "@/utils/i18n"
import { getWebdavConfig, syncPreferencesWithWebdav } from "@/utils/local-dictionary/client"
import { cn } from "@/utils/styles/utils"
import { queryClient } from "@/utils/tanstack-query"
import { useWebdavSyncState } from "../../preference/webdav-sync/use-webdav-sync-state"

const WEBDAV_CONFIG_QUERY_KEY = ["local-dictionary-webdav-config"]

export function ApiProvidersSyncStatus() {
  const { data: webdavConfig, isLoading: isConfigLoading } = useQuery({
    queryKey: WEBDAV_CONFIG_QUERY_KEY,
    queryFn: () => getWebdavConfig(),
  })
  const syncState = useWebdavSyncState()
  const [isLocalSyncing, setIsLocalSyncing] = useState(false)

  const isConfigured = Boolean(webdavConfig?.endpoint && webdavConfig?.username)
  const isSyncing = syncState?.configSyncStatus === "syncing" || isLocalSyncing
  const isError = syncState?.configSyncStatus === "failed" || Boolean(syncState?.configLastError)

  const handleSyncPreferences = async () => {
    setIsLocalSyncing(true)
    try {
      const reply = await syncPreferencesWithWebdav()
      if (reply?.ok) {
        const action = reply.components?.config?.action
        let title = i18n.t("options.apiProviders.sync.upToDate")
        if (action === "uploaded") {
          title = i18n.t("options.apiProviders.sync.synced")
        } else if (action === "downloaded") {
          title = i18n.t("options.apiProviders.sync.pulled")
        }
        toastManager.add({
          type: "success",
          title,
        })
        void queryClient.invalidateQueries({ queryKey: WEBDAV_CONFIG_QUERY_KEY })
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-webdav-sync-state"] })
      } else if (reply?.error) {
        toastManager.add({
          type: "error",
          title: reply.error.message || "Failed to sync preferences",
        })
      }
    } catch (err: any) {
      toastManager.add({
        type: "error",
        title: err?.message || "Failed to sync preferences",
      })
    } finally {
      setIsLocalSyncing(false)
    }
  }

  if (isConfigLoading) {
    return null
  }

  if (!isConfigured) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon icon="tabler:cloud-off" className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                {i18n.t("options.apiProviders.sync.title")}
              </span>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {i18n.t("options.apiProviders.sync.notConfigured")}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {i18n.t("options.apiProviders.sync.notConfiguredDesc")}
            </p>
          </div>
        </div>

        <Link
          to="/preference/webdav-sync"
          state={DRILL_IN_LOCATION_STATE}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {i18n.t("options.apiProviders.sync.goToSettings")}
          <Icon icon="tabler:arrow-right" className="size-3.5" />
        </Link>
      </div>
    )
  }

  const lastSyncTime = syncState?.configLastSuccessTime

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/60 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            isSyncing
              ? "bg-blue-500/10 text-blue-500"
              : isError
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          <Icon
            icon={
              isSyncing
                ? "tabler:cloud-upload"
                : isError
                  ? "tabler:cloud-exclamation"
                  : "tabler:cloud-check"
            }
            className={cn("size-4.5", isSyncing && "animate-pulse")}
          />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {i18n.t("options.apiProviders.sync.title")}
            </span>
            <Badge
              variant={isError ? "destructive" : isSyncing ? "default" : "secondary"}
              className="text-[10px]"
            >
              {isSyncing
                ? i18n.t("options.apiProviders.sync.syncing")
                : isError
                  ? i18n.t("options.dictionary.webdav.phaseError")
                  : i18n.t("options.dictionary.webdav.connected")}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {i18n.t("options.apiProviders.sync.description")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 self-end sm:self-center">
        {lastSyncTime && (
          <span className="text-[11px] whitespace-nowrap text-muted-foreground">
            {i18n.t("options.apiProviders.sync.lastSync")}:{" "}
            {new Date(lastSyncTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncPreferences}
          disabled={isSyncing}
          className="cursor-pointer"
          aria-label="sync-preferences-button"
        >
          <Icon
            icon="tabler:refresh"
            className={cn("mr-1.5 size-3.5", isSyncing && "animate-spin")}
          />
          {isSyncing
            ? i18n.t("options.apiProviders.sync.syncing")
            : i18n.t("options.apiProviders.sync.syncNow")}
        </Button>
      </div>
    </div>
  )
}
