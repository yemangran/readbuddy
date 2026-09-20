import { browser } from "#imports"
import { selectFreshTranslateProviders } from "@/utils/config/default-translate-provider"
import { logger } from "@/utils/logger"
import { SessionCacheGroupRegistry } from "@/utils/session-cache/session-cache-group-registry"
import { ensureInitializedConfig, isFreshInstalledConfig } from "./config"

/**
 * The install lifecycle seam: everything the background script does in response to
 * `runtime.onInstalled`.
 *
 * Installation is deliberately silent — no tab is opened here, so a fresh install
 * never navigates away from the user's current page and never depends on an external
 * host being reachable (see docs/specs/remove-upstream-website-links.md).
 */
export function setupInstallLifecycle() {
  browser.runtime.onInstalled.addListener(async (details) => {
    await ensureInitializedConfig()

    // Deliberately last: probing Google Translate can hang for seconds on networks that
    // block it, and nothing above should wait for that. Awaiting inside the listener
    // keeps the service worker alive until the probe settles. Guarded by the config
    // actually being new rather than by the install reason: reloading an unpacked
    // extension reports "install" while the developer's provider choice is still in
    // storage, and a config rebuilt from defaults after failing validation during an
    // update deserves the same provider selection a fresh install gets.
    if (await isFreshInstalledConfig()) {
      await selectFreshTranslateProviders()
    }

    // Clear blog cache on extension update to fetch latest blog posts
    if (details.reason === "update") {
      logger.info("[Background] Extension updated, clearing blog cache")
      await SessionCacheGroupRegistry.removeCacheGroup("blog-fetch")
    }
  })
}
