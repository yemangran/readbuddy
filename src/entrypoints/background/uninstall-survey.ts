import { browser } from "#imports"
import { i18n } from "@/utils/i18n"

/**
 * Origin and path of the canonical open-source issue tracker — the only place the
 * uninstall URL may point. MUST stay in sync with `uninstallSurveyUrl` in
 * `src/locales/*.yml` (see docs/specs/remove-upstream-website-links.md).
 */
const CANONICAL_TRACKER_ORIGIN = "https://github.com"
const CANONICAL_TRACKER_PATH = "/yemangran/readbuddy"

/**
 * The uninstall lifecycle seam: the single URL the browser opens after the extension is
 * removed.
 *
 * Uninstalling must stay private, so no environment fingerprint is ever collected here —
 * no extension version, browser type/version, OS or UI language is appended. The target is
 * either the parameterless canonical issue tracker or nothing at all: any other value
 * (blank, malformed, a leftover survey host) clears the registration so uninstall opens
 * no page instead of navigating the user to an unknown host.
 */
export async function setupUninstallSurvey() {
  void browser.runtime.setUninstallURL(resolveUninstallURL(i18n.t("uninstallSurveyUrl")))
}

function resolveUninstallURL(localizedUrl: string): string {
  try {
    const url = new URL(localizedUrl)
    const isCanonicalTracker =
      url.origin === CANONICAL_TRACKER_ORIGIN && url.pathname.startsWith(CANONICAL_TRACKER_PATH)
    if (!isCanonicalTracker) return ""

    // Drop every query parameter so no tracking metadata can survive into the uninstall
    // URL, however the localized value was authored.
    url.search = ""
    return url.toString()
  } catch {
    // Not a URL at all: no page to open on uninstall.
    return ""
  }
}
