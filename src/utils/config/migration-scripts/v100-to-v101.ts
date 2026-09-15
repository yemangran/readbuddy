/**
 * Migration script from v100 to v101.
 *
 * Rewrites every stored reference to the hosted Built-in AI providers
 * (`read-frog-free-ai` / `read-frog-advance-ai`) to local providers. The
 * hosted execution path is gone from this fork, so a config still pointing at
 * those ids would resolve to a provider that can never run.
 *
 * Translate-capable features (page translation, video subtitles, selection
 * translation, input translation) move to the free Microsoft Translate row so
 * translation keeps working without an API key. LLM features (the built-in
 * Dictionary, custom actions, note suggestions, LLM language detection) move
 * to the OpenAI row, matching the BYOK default for fresh installs.
 *
 * When a fallback row is missing from `providersConfig` it is inserted, and
 * when it exists but is disabled it is re-enabled: `configSchema` requires
 * every feature provider to be enabled, and a validation failure resets the
 * whole config to DEFAULT_CONFIG — losing the user's settings over a row they
 * cannot see in this fork anymore.
 *
 * Idempotent: a config with no hosted provider ids is returned by identity,
 * and re-running on a migrated config changes nothing.
 *
 * IMPORTANT: This is a frozen snapshot. All values and helpers are deliberately inline and it
 * imports nothing from the evolving application code.
 */

function isObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

const HOSTED_PROVIDER_IDS = new Set(["read-frog-free-ai", "read-frog-advance-ai"])

const TRANSLATE_FALLBACK_PROVIDER_ID = "microsoft-translate-default"
const LLM_FALLBACK_PROVIDER_ID = "openai-default"

const TRANSLATE_FALLBACK_PROVIDER = {
  id: TRANSLATE_FALLBACK_PROVIDER_ID,
  name: "Microsoft Translator",
  enabled: true,
  provider: "microsoft-translate",
}

const LLM_FALLBACK_PROVIDER = {
  id: LLM_FALLBACK_PROVIDER_ID,
  name: "OpenAI",
  enabled: true,
  provider: "openai",
  model: { model: "gpt-5.6-luna", isCustomModel: false, customModel: null },
  reasoning: "none",
}

function isHostedProviderId(value: any): boolean {
  return typeof value === "string" && HOSTED_PROVIDER_IDS.has(value)
}

/**
 * Insert the row when missing, or re-enable it when present but disabled.
 * Returns the input array by identity when no repair is needed.
 */
function ensureProviderRow(rows: any[], row: any): any[] {
  const existing = rows.find((item: any) => isObject(item) && item.id === row.id)
  if (!existing) {
    return [...rows, row]
  }
  if (existing.enabled === true) {
    return rows
  }
  return rows.map((item: any) =>
    isObject(item) && item.id === row.id ? { ...item, enabled: true } : item,
  )
}

export function migrate(oldConfig: any): any {
  if (!isObject(oldConfig)) {
    return oldConfig
  }

  let usedTranslateFallback = false
  let usedLlmFallback = false
  const next: Record<string, any> = { ...oldConfig }

  for (const section of ["pageTranslation", "videoSubtitles", "inputTranslation"]) {
    const value = oldConfig[section]
    if (isObject(value) && isHostedProviderId(value.providerId)) {
      next[section] = { ...value, providerId: TRANSLATE_FALLBACK_PROVIDER_ID }
      usedTranslateFallback = true
    }
  }

  const selectionToolbar = oldConfig.selectionToolbar
  if (isObject(selectionToolbar)) {
    const nextToolbar: Record<string, any> = { ...selectionToolbar }
    let toolbarChanged = false

    const features = selectionToolbar.features
    if (
      isObject(features) &&
      isObject(features.translate) &&
      isHostedProviderId(features.translate.providerId)
    ) {
      nextToolbar.features = {
        ...features,
        translate: { ...features.translate, providerId: TRANSLATE_FALLBACK_PROVIDER_ID },
      }
      usedTranslateFallback = true
      toolbarChanged = true
    }

    const noteSuggestion = selectionToolbar.noteSuggestion
    if (isObject(noteSuggestion) && isHostedProviderId(noteSuggestion.providerId)) {
      nextToolbar.noteSuggestion = { ...noteSuggestion, providerId: LLM_FALLBACK_PROVIDER_ID }
      usedLlmFallback = true
      toolbarChanged = true
    }

    const builtInActions = selectionToolbar.builtInActions
    if (
      isObject(builtInActions) &&
      isObject(builtInActions.dictionary) &&
      isHostedProviderId(builtInActions.dictionary.providerId)
    ) {
      nextToolbar.builtInActions = {
        ...builtInActions,
        dictionary: { ...builtInActions.dictionary, providerId: LLM_FALLBACK_PROVIDER_ID },
      }
      usedLlmFallback = true
      toolbarChanged = true
    }

    if (Array.isArray(selectionToolbar.customActions)) {
      let actionsChanged = false
      const nextActions = selectionToolbar.customActions.map((action: any) => {
        if (isObject(action) && isHostedProviderId(action.providerId)) {
          actionsChanged = true
          return { ...action, providerId: LLM_FALLBACK_PROVIDER_ID }
        }
        return action
      })
      if (actionsChanged) {
        nextToolbar.customActions = nextActions
        usedLlmFallback = true
        toolbarChanged = true
      }
    }

    if (toolbarChanged) {
      next.selectionToolbar = nextToolbar
    }
  }

  const languageDetection = oldConfig.languageDetection
  if (isObject(languageDetection) && isHostedProviderId(languageDetection.providerId)) {
    next.languageDetection = { ...languageDetection, providerId: LLM_FALLBACK_PROVIDER_ID }
    usedLlmFallback = true
  }

  if (!usedTranslateFallback && !usedLlmFallback) {
    return oldConfig
  }

  const providersConfig = oldConfig.providersConfig
  if (Array.isArray(providersConfig)) {
    let rows = providersConfig
    if (usedTranslateFallback) {
      rows = ensureProviderRow(rows, TRANSLATE_FALLBACK_PROVIDER)
    }
    if (usedLlmFallback) {
      rows = ensureProviderRow(rows, LLM_FALLBACK_PROVIDER)
    }
    if (rows !== providersConfig) {
      next.providersConfig = rows
    }
  }

  return next
}
