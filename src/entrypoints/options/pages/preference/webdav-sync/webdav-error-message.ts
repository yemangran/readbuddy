import type { WebdavErrorCode } from "@/utils/local-dictionary/types"
import { i18n, type I18nKey } from "@/utils/i18n"

/**
 * Maps every WebDAV error code the sync engine can report to a localized,
 * user-facing message. Shared by the preference page's sync entry and the
 * WebDAV detail page, so the same failure reads the same way in both places.
 */
export const WEBDAV_ERROR_I18N_KEYS: Record<WebdavErrorCode, I18nKey> = {
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

/**
 * Resolves a localized message for a WebDAV error, falling back to the server's
 * own message and then to the caller's default when the code is unknown.
 */
export function getWebdavErrorMessage(
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
