import { Icon } from "@iconify/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { toastManager } from "@/components/ui/base-ui/toast"
import { ConfigItem } from "@/entrypoints/options/components/config-item"
import { DRILL_IN_LOCATION_STATE } from "@/entrypoints/options/navigation/drill-in"
import { i18n } from "@/utils/i18n"
import { getWebdavConfig, triggerWebdavSync } from "@/utils/local-dictionary/client"
import { cn } from "@/utils/styles/utils"
import { queryClient } from "@/utils/tanstack-query"
import { useWebdavSyncState } from "./use-webdav-sync-state"
import { getWebdavErrorMessage } from "./webdav-error-message"

const WEBDAV_CONFIG_QUERY_KEY = ["local-dictionary-webdav-config"]

/**
 * Whether WebDAV is configured, plus the latest sync outcome. The state comes
 * from the shared hook, so this row and the detail page never disagree.
 */
function useWebdavSyncStatus() {
  const { data: config } = useQuery({
    queryKey: WEBDAV_CONFIG_QUERY_KEY,
    queryFn: () => getWebdavConfig(),
  })
  const syncState = useWebdavSyncState()

  return {
    isConfigured: Boolean(config?.endpoint && config?.username),
    syncState,
  }
}

/**
 * The one cloud-sync row of the preference page: connection status, when the
 * last pass ran, and a "Sync Now" that runs the whole unified pipeline
 * (dictionary, review states and preferences). The row replaces the old Google
 * Drive card, and drills into the WebDAV detail page for the full status.
 */
export function WebdavSyncConfigItem() {
  const { isConfigured, syncState } = useWebdavSyncStatus()
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const reply = await triggerWebdavSync({ reason: "manual" })
      if (reply?.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.webdav.syncSuccess"),
        })
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else if (reply) {
        toastManager.add({
          type: "error",
          title: getWebdavErrorMessage(
            reply.error,
            i18n.t("options.dictionary.webdav.networkError"),
          ),
        })
      }
    } finally {
      setIsSyncing(false)
    }
  }

  const phase = syncState?.phase
  const hasSyncProblem = phase === "paused" || phase === "error"

  const statusLabel = !isConfigured
    ? i18n.t("options.dictionary.webdav.notConfigured")
    : phase === "syncing"
      ? i18n.t("options.dictionary.webdav.phaseSyncing")
      : hasSyncProblem
        ? i18n.t("options.dictionary.webdav.phaseError")
        : i18n.t("options.dictionary.webdav.connected")

  return (
    <ConfigItem
      id="webdav-sync"
      title={i18n.t("options.dictionary.webdav.title")}
      description={i18n.t("options.dictionary.webdav.description")}
    >
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <Badge variant={hasSyncProblem ? "destructive" : isConfigured ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={!isConfigured || isSyncing}
            aria-label="webdav-sync-now"
          >
            <Icon
              icon="tabler:refresh"
              className={cn("mr-1.5 size-4", (isSyncing || phase === "syncing") && "animate-spin")}
            />
            {isSyncing || phase === "syncing"
              ? i18n.t("options.dictionary.webdav.syncing")
              : i18n.t("options.dictionary.webdav.syncNow")}
          </Button>
          <Link
            to="/preference/webdav-sync"
            state={DRILL_IN_LOCATION_STATE}
            aria-label="webdav-sync-detail"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon icon="tabler:chevron-right" className="size-4" />
          </Link>
        </div>
        {syncState?.lastSuccessTime && (
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {i18n.t("options.dictionary.webdav.lastSync")}:{" "}
            {new Date(syncState.lastSuccessTime).toLocaleString()}
          </span>
        )}
      </div>
    </ConfigItem>
  )
}
