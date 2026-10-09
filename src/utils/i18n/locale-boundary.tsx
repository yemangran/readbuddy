import type { ReactNode } from "react"
import i18next, { changeLanguage } from "i18next"
import { useAtomValue } from "jotai"
import { Fragment, useEffect } from "react"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { i18n, type I18nKey } from "./index"
import { resolveUiLocale } from "./locale-map"

/** Translation keys under the `documentTitles` namespace — one per extension page. */
export type DocumentTitleKey = Extract<I18nKey, `documentTitles.${string}`>

/**
 * Applies the configured UI language to the React subtree and re-renders it on change.
 *
 * Placement: MUST sit below the jotai `Provider`/`HydrateAtoms` and `QueryClientProvider`
 * of each entrypoint (jotai recreates its store per Provider instance, so re-keying above
 * it would wipe atom state), and above the page/app content.
 *
 * Mechanism: `i18next.changeLanguage` is synchronous with bundled resources, so we apply it
 * during render (guarded) and re-key the subtree on the RESOLVED locale. This makes the
 * remounted children paint in the new language on their first render — the reason we key on
 * the resolved locale (not the raw `uiLanguage`) is that "auto"→"en" and explicit "en" must
 * not trigger a spurious remount.
 *
 * When `documentTitleKey` is provided, the boundary also owns the document-level chrome of
 * an extension-owned page: it composes `document.title` from the page name and the localized
 * app name, and syncs `<html lang>` to the resolved locale for assistive tech. Content-script
 * roots mount this component on HOST pages and pass no key — the writes must never run there,
 * or they would clobber the host page's title and language.
 */
export function LocaleBoundary({
  children,
  documentTitleKey,
}: {
  children: ReactNode
  documentTitleKey?: DocumentTitleKey
}) {
  const uiLanguage = useAtomValue(configFieldsAtomMap.uiLanguage)
  const resolvedLocale = resolveUiLocale(uiLanguage)

  if (i18next.language !== resolvedLocale) {
    // Synchronous with bundled resources; the returned promise is already resolved.
    void changeLanguage(resolvedLocale)
  }

  useEffect(() => {
    if (!documentTitleKey) {
      return
    }
    // The render-phase switch above has already applied `resolvedLocale` to i18next,
    // so both translations resolve in the active language. Plain assignments are
    // idempotent, which keeps this safe under React StrictMode double-invoked effects.
    document.title = `${i18n.t(documentTitleKey)} | ${i18n.t("name")}`
    document.documentElement.lang = resolvedLocale
  }, [resolvedLocale, documentTitleKey])

  return <Fragment key={resolvedLocale}>{children}</Fragment>
}
