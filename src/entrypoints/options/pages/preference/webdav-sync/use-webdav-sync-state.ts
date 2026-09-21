import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { getWebdavSyncState, watchWebdavSyncState } from "@/utils/local-dictionary/client"
import { queryClient } from "@/utils/tanstack-query"

/**
 * One sync state for every surface that shows it: the WebDAV detail page and
 * the preference page's sync row share this query key, so a pass started
 * anywhere — the debounced background sync, another options tab — updates both.
 */
export const WEBDAV_SYNC_STATE_QUERY_KEY = ["local-dictionary-webdav-sync-state"]

/**
 * The latest sync outcome, polled and watched. Polling keeps the row honest
 * while the page is open; the storage watch picks up passes this context never
 * saw the request for.
 */
export function useWebdavSyncState() {
  const { data: syncState } = useQuery({
    queryKey: WEBDAV_SYNC_STATE_QUERY_KEY,
    queryFn: () => getWebdavSyncState(),
    refetchInterval: 2000,
  })

  useEffect(() => {
    return watchWebdavSyncState(() => {
      void queryClient.invalidateQueries({ queryKey: WEBDAV_SYNC_STATE_QUERY_KEY })
    })
  }, [])

  return syncState
}
