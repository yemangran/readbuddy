import type { WebdavSyncState } from "@/utils/local-dictionary/types"
import { Icon } from "@iconify/react"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"
import { getWebdavErrorMessage } from "../webdav-error-message"

/** What the last pass that attempted preferences did with them. */
const CONFIG_SYNC_ACTION_I18N_KEYS = {
  uploaded: "options.dictionary.webdav.configSyncActionUploaded",
  downloaded: "options.dictionary.webdav.configSyncActionDownloaded",
  "no-change": "options.dictionary.webdav.allSynced",
} as const

const CONFIG_SYNC_STATUS_I18N_KEYS = {
  idle: "options.dictionary.webdav.configSyncIdle",
  synced: "options.dictionary.webdav.configSyncSynced",
  failed: "options.dictionary.webdav.configSyncFailed",
} as const

export interface WebdavConfigSyncOverviewProps {
  state: WebdavSyncState
  isSyncing: boolean
  onSync: () => void
}

/**
 * The preference component of the unified sync (`readbuddy-config.json`): when
 * the settings last synced, what the last pass did with them, and a trigger
 * that reconciles preferences on their own. The dictionary and review files
 * belong to the global "Sync Now" above, which runs all three components.
 */
export function WebdavConfigSyncOverview({
  state,
  isSyncing,
  onSync,
}: WebdavConfigSyncOverviewProps) {
  const status = state.configSyncStatus

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
      <div className="flex items-center justify-between font-semibold text-foreground">
        <span className="flex items-center gap-1.5">
          <Icon icon="tabler:settings-cog" className="size-4 text-primary" />
          {i18n.t("options.dictionary.webdav.configSyncTitle")}
        </span>
        <Button
          size="xs"
          variant="ghost"
          onClick={onSync}
          disabled={isSyncing}
          aria-label="config-sync-now"
          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Icon icon="tabler:refresh" className={cn("mr-1 size-3", isSyncing && "animate-spin")} />
          {isSyncing
            ? i18n.t("options.dictionary.webdav.syncing")
            : i18n.t("options.dictionary.webdav.configSyncNow")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status === "failed" ? "destructive" : "default"} className="text-[10px]">
          {i18n.t(CONFIG_SYNC_STATUS_I18N_KEYS[status])}
        </Badge>
        {state.configLastAction && (
          <Badge variant="secondary" className="text-[10px]">
            {i18n.t(CONFIG_SYNC_ACTION_I18N_KEYS[state.configLastAction])}
          </Badge>
        )}
        <span className="text-muted-foreground">
          {i18n.t("options.dictionary.webdav.lastSync")}:{" "}
          <span className="font-medium text-foreground">
            {state.configLastSuccessTime
              ? new Date(state.configLastSuccessTime).toLocaleString()
              : i18n.t("options.dictionary.webdav.neverSynced")}
          </span>
        </span>
      </div>

      {status === "failed" && state.configLastError && (
        <div className="text-destructive">{getWebdavErrorMessage(state.configLastError)}</div>
      )}
    </div>
  )
}
