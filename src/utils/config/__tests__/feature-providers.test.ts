import type { ProviderConfig } from "@/types/config/provider"
import { describe, expect, it } from "vitest"
import { isLLMProviderConfig } from "@/types/config/provider"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { buildFeatureProviderPatch } from "@/utils/constants/feature-providers"
import { getSelectableProvidersForCapability } from "@/utils/providers/provider-registry"
import {
  computeLanguageDetectionFallbackAfterDeletion,
  computeProviderFallbacksAfterDeletion,
  computeSelectionToolbarCustomActionFallbacksAfterDeletion,
  findFeatureMissingProvider,
  resolveLanguageDetectionConfigForModeChange,
} from "../helpers"

function getProviderById(id: string): ProviderConfig {
  const provider = DEFAULT_CONFIG.providersConfig.find((item) => item.id === id)
  if (!provider) throw new Error(`Provider "${id}" not found in DEFAULT_CONFIG.providersConfig`)
  return provider
}

describe("feature providers", () => {
  describe("buildFeatureProviderPatch", () => {
    it("builds patch for a single feature assignment", () => {
      const patch = buildFeatureProviderPatch({
        pageTranslation: "openai-default",
      })

      expect(patch).toEqual({
        pageTranslation: {
          providerId: "openai-default",
        },
      })
    })

    it("builds patch for the note suggestion feature", () => {
      const patch = buildFeatureProviderPatch({
        noteSuggestion: "read-frog-free-ai",
      })

      expect(patch).toEqual({
        selectionToolbar: {
          noteSuggestion: {
            providerId: "read-frog-free-ai",
          },
        },
      })
    })

    it("builds patch for multiple feature assignments", () => {
      const patch = buildFeatureProviderPatch({
        pageTranslation: "google-translate-default",
        selectionTranslation: "openai-default",
      })

      expect(patch).toEqual({
        pageTranslation: {
          providerId: "google-translate-default",
        },
        selectionToolbar: {
          features: {
            translate: {
              providerId: "openai-default",
            },
          },
        },
      })
    })
  })

  describe("getSelectableProvidersForCapability", () => {
    it("returns only enabled compatible local providers", () => {
      const providers = getSelectableProvidersForCapability(
        "customAction",
        DEFAULT_CONFIG.providersConfig,
      )

      expect(providers).toEqual(
        DEFAULT_CONFIG.providersConfig.filter((p) => p.enabled && isLLMProviderConfig(p)),
      )
    })
  })

  describe("computeProviderFallbacksAfterDeletion", () => {
    it("returns fallback assignments for every affected feature when candidates exist", () => {
      const config = {
        ...DEFAULT_CONFIG,
        pageTranslation: {
          ...DEFAULT_CONFIG.pageTranslation,
          providerId: "deleted-provider",
        },
        videoSubtitles: {
          ...DEFAULT_CONFIG.videoSubtitles,
          providerId: "deleted-provider",
        },
        selectionToolbar: {
          ...DEFAULT_CONFIG.selectionToolbar,
          features: {
            ...DEFAULT_CONFIG.selectionToolbar.features,
            translate: { enabled: true, providerId: "deleted-provider", shortcut: "Alt+T" },
          },
        },
        inputTranslation: {
          ...DEFAULT_CONFIG.inputTranslation,
          providerId: "deleted-provider",
        },
      }

      const remainingProviders = [
        getProviderById("google-translate-default"),
        getProviderById("openai-default"),
      ]

      const fallbacks = computeProviderFallbacksAfterDeletion(
        "deleted-provider",
        config,
        remainingProviders,
      )

      expect(fallbacks).toEqual({
        pageTranslation: "google-translate-default",
        videoSubtitles: "google-translate-default",
        selectionTranslation: "google-translate-default",
        inputTranslation: "google-translate-default",
      })
    })

    it("keeps a fresh profile off Microsoft when it deletes its provider in translationOnly mode", () => {
      // Microsoft cannot run translationOnly page mode (translation-only-gate.ts), and the
      // provider pickers hide it while that mode is active — falling back onto it leaves the
      // page-translate slot pointing at an option missing from its own list, which is what the
      // selector then crashes on. Nothing in the fallback consults the gate, so the guarantee
      // rests entirely on Google leading DEFAULT_PROVIDER_CONFIG_LIST.
      const config = {
        ...DEFAULT_CONFIG,
        pageTranslation: {
          ...DEFAULT_CONFIG.pageTranslation,
          mode: "translationOnly" as const,
          providerId: "deleted-provider",
        },
      }

      const fallbacks = computeProviderFallbacksAfterDeletion(
        "deleted-provider",
        config,
        DEFAULT_CONFIG.providersConfig,
      )

      expect(fallbacks.pageTranslation).toBe("google-translate-default")
    })

    it("returns no fallback when page translation has no local fallback", () => {
      const config = {
        ...DEFAULT_CONFIG,
        pageTranslation: {
          ...DEFAULT_CONFIG.pageTranslation,
          providerId: "deleted-provider",
        },
      }

      const remainingProviders: ProviderConfig[] = []

      const fallbacks = computeProviderFallbacksAfterDeletion(
        "deleted-provider",
        config,
        remainingProviders,
      )

      expect(fallbacks).toEqual({})
    })

    it("skips disabled local providers when picking a fallback", () => {
      const config = {
        ...DEFAULT_CONFIG,
        pageTranslation: {
          ...DEFAULT_CONFIG.pageTranslation,
          providerId: "deleted-provider",
        },
      }

      const remainingProviders = [
        {
          ...getProviderById("openai-default"),
          enabled: false,
        },
      ]

      const fallbacks = computeProviderFallbacksAfterDeletion(
        "deleted-provider",
        config,
        remainingProviders,
      )

      expect(fallbacks).toEqual({})
    })

    it("returns no fallback for selection toolbar translation when no local provider is available", () => {
      const config = {
        ...DEFAULT_CONFIG,
        selectionToolbar: {
          ...DEFAULT_CONFIG.selectionToolbar,
          features: {
            ...DEFAULT_CONFIG.selectionToolbar.features,
            translate: { enabled: true, providerId: "deleted-provider", shortcut: "Alt+T" },
          },
        },
      }

      const fallbacks = computeProviderFallbacksAfterDeletion("deleted-provider", config, [])

      expect(fallbacks).toEqual({})
    })

    it("returns no fallback for note suggestion when no local llm provider remains", () => {
      const config = {
        ...DEFAULT_CONFIG,
        selectionToolbar: {
          ...DEFAULT_CONFIG.selectionToolbar,
          noteSuggestion: {
            ...DEFAULT_CONFIG.selectionToolbar.noteSuggestion,
            providerId: "deleted-provider",
          },
        },
      }

      const fallbacks = computeProviderFallbacksAfterDeletion("deleted-provider", config, [
        getProviderById("google-translate-default"),
      ])

      expect(fallbacks).toEqual({})
    })
  })

  describe("findFeatureMissingProvider", () => {
    it("reports the first feature left with no provider that can run it", () => {
      const remainingProviders: ProviderConfig[] = []

      expect(findFeatureMissingProvider(remainingProviders)).toBe("pageTranslation")
    })

    it("returns null when all features have at least one compatible provider", () => {
      const remainingProviders = [
        getProviderById("google-translate-default"),
        getProviderById("openai-default"),
      ]

      expect(findFeatureMissingProvider(remainingProviders)).toBeNull()
    })

    it("does not count a disabled provider as coverage", () => {
      const remainingProviders = [
        {
          ...getProviderById("openai-default"),
          enabled: false,
        },
      ]

      expect(findFeatureMissingProvider(remainingProviders)).toBe("pageTranslation")
    })

    it("reports the LLM-only feature when only keyless translate providers remain", () => {
      // Google/Microsoft cover the four translate features; note suggestion
      // needs an LLM, so it is what the guard trips on.
      const remainingProviders = [
        getProviderById("google-translate-default"),
        getProviderById("microsoft-translate-default"),
      ]

      expect(findFeatureMissingProvider(remainingProviders, DEFAULT_CONFIG)).toBe("noteSuggestion")
    })

    it("guards a feature the user has switched off, because its providerId is still stored", () => {
      // computeProviderFallbacksAfterDeletion can only reassign a slot when a
      // replacement exists. Letting this through would leave
      // noteSuggestion.providerId pointing at a provider that no longer
      // exists, which resolves to null the moment it is switched back on.
      const config = {
        ...DEFAULT_CONFIG,
        selectionToolbar: {
          ...DEFAULT_CONFIG.selectionToolbar,
          noteSuggestion: { ...DEFAULT_CONFIG.selectionToolbar.noteSuggestion, enabled: false },
        },
      }
      const remainingProviders = [
        getProviderById("google-translate-default"),
        getProviderById("microsoft-translate-default"),
      ]

      expect(findFeatureMissingProvider(remainingProviders, config)).toBe("noteSuggestion")
    })
  })

  describe("computeSelectionToolbarCustomActionFallbacksAfterDeletion", () => {
    it("reassigns the built-in Dictionary provider without changing custom actions", () => {
      const config = {
        ...DEFAULT_CONFIG,
        selectionToolbar: {
          ...DEFAULT_CONFIG.selectionToolbar,
          builtInActions: {
            dictionary: {
              ...DEFAULT_CONFIG.selectionToolbar.builtInActions.dictionary,
              providerId: "deleted-provider",
            },
          },
        },
      }

      const result = computeSelectionToolbarCustomActionFallbacksAfterDeletion(
        "deleted-provider",
        config,
        [getProviderById("jalapenocloud-default")],
      )

      expect(result?.builtInActions.dictionary.providerId).toBe("jalapenocloud-default")
      expect(result?.customActions).toEqual([])
    })

    it("reassigns affected custom actions to the first enabled llm provider", () => {
      const config = {
        ...DEFAULT_CONFIG,
        selectionToolbar: {
          ...DEFAULT_CONFIG.selectionToolbar,
          customActions: [
            {
              id: "action-a",
              name: "Action A",
              enabled: true,
              icon: "tabler:sparkles",
              providerId: "deleted-provider",
              systemPrompt: "",
              prompt: "{{selection}}",
              outputSchema: [
                {
                  id: "field-a",
                  name: "summary",
                  type: "string" as const,
                  description: "",
                  speaking: false,
                },
              ],
            },
          ],
        },
      }

      const remainingProviders = [
        {
          ...getProviderById("openai-default"),
          enabled: false,
        },
        getProviderById("jalapenocloud-default"),
      ]

      const result = computeSelectionToolbarCustomActionFallbacksAfterDeletion(
        "deleted-provider",
        config,
        remainingProviders,
      )

      expect(result?.customActions).toEqual([
        expect.objectContaining({
          id: "action-a",
          providerId: "jalapenocloud-default",
        }),
      ])
    })

    it("falls back to built-in AI when no enabled llm provider is available", () => {
      const config = {
        ...DEFAULT_CONFIG,
        selectionToolbar: {
          ...DEFAULT_CONFIG.selectionToolbar,
          customActions: [
            {
              id: "action-a",
              name: "Action A",
              enabled: true,
              icon: "tabler:sparkles",
              providerId: "deleted-provider",
              systemPrompt: "",
              prompt: "{{selection}}",
              outputSchema: [
                {
                  id: "field-a",
                  name: "summary",
                  type: "string" as const,
                  description: "",
                  speaking: false,
                },
              ],
            },
          ],
        },
      }

      const remainingProviders = [
        {
          ...getProviderById("openai-default"),
          enabled: false,
        },
      ]

      const result = computeSelectionToolbarCustomActionFallbacksAfterDeletion(
        "deleted-provider",
        config,
        remainingProviders,
      )

      // No enabled LLM remains: nothing to reassign to.
      expect(result).toBeNull()
    })
  })

  describe("resolveLanguageDetectionConfigForModeChange", () => {
    it("assigns the first enabled llm provider when switching from basic to llm", () => {
      const result = resolveLanguageDetectionConfigForModeChange(
        DEFAULT_CONFIG.languageDetection,
        "llm",
        DEFAULT_CONFIG.providersConfig,
      )

      expect(result).toEqual({
        mode: "llm",
        providerId: "openai-default",
      })
    })

    it("keeps the current provider when it is already an enabled llm provider", () => {
      const result = resolveLanguageDetectionConfigForModeChange(
        {
          mode: "basic",
          providerId: "jalapenocloud-default",
        },
        "llm",
        DEFAULT_CONFIG.providersConfig,
      )

      expect(result).toEqual({
        mode: "llm",
        providerId: "jalapenocloud-default",
      })
    })

    it("returns null when no enabled local llm provider remains", () => {
      const result = resolveLanguageDetectionConfigForModeChange(
        DEFAULT_CONFIG.languageDetection,
        "llm",
        [
          {
            ...getProviderById("openai-default"),
            enabled: false,
          },
          {
            ...getProviderById("jalapenocloud-default"),
            enabled: false,
          },
        ],
      )

      // Switching to llm mode is impossible without a local LLM: arming the
      // mode would only produce an inert setting.
      expect(result).toBeNull()
    })
  })

  describe("computeLanguageDetectionFallbackAfterDeletion", () => {
    it("reassigns language detection to the first enabled llm provider", () => {
      const config = {
        ...DEFAULT_CONFIG,
        languageDetection: {
          mode: "llm" as const,
          providerId: "deleted-provider",
        },
      }

      const result = computeLanguageDetectionFallbackAfterDeletion("deleted-provider", config, [
        {
          ...getProviderById("openai-default"),
          enabled: false,
        },
        getProviderById("jalapenocloud-default"),
      ])

      expect(result).toBe("jalapenocloud-default")
    })
  })
})
