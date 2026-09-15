import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v100-to-v101"

/** A stored v100 config that references hosted providers everywhere they can appear. */
function hostedConfig(): any {
  return {
    providersConfig: [
      {
        id: "google-translate-default",
        name: "Google Translate",
        enabled: true,
        provider: "google-translate",
      },
    ],
    pageTranslation: {
      providerId: "read-frog-free-ai",
      mode: "bilingual",
    },
    videoSubtitles: {
      providerId: "read-frog-advance-ai",
    },
    inputTranslation: {
      providerId: "read-frog-free-ai",
    },
    languageDetection: {
      mode: "llm",
      providerId: "read-frog-advance-ai",
    },
    selectionToolbar: {
      features: {
        translate: {
          enabled: true,
          providerId: "read-frog-free-ai",
        },
        speak: { enabled: true },
      },
      builtInActions: {
        dictionary: {
          enabled: true,
          providerId: "read-frog-free-ai",
        },
      },
      customActions: [
        { id: "action-1", providerId: "read-frog-advance-ai" },
        { id: "action-2", providerId: "deepseek-default" },
      ],
      noteSuggestion: {
        enabled: true,
        actionId: "default-dictionary",
        providerId: "read-frog-free-ai",
      },
    },
  }
}

describe("v100 to v101 migration", () => {
  it("rewrites translate features to the Microsoft Translate fallback", () => {
    const migrated = migrate(hostedConfig())

    expect(migrated.pageTranslation.providerId).toBe("microsoft-translate-default")
    expect(migrated.videoSubtitles.providerId).toBe("microsoft-translate-default")
    expect(migrated.inputTranslation.providerId).toBe("microsoft-translate-default")
    expect(migrated.selectionToolbar.features.translate.providerId).toBe(
      "microsoft-translate-default",
    )
  })

  it("rewrites LLM features to the OpenAI fallback", () => {
    const migrated = migrate(hostedConfig())

    expect(migrated.selectionToolbar.builtInActions.dictionary.providerId).toBe("openai-default")
    expect(migrated.selectionToolbar.customActions.map((action: any) => action.providerId)).toEqual(
      ["openai-default", "deepseek-default"],
    )
    expect(migrated.selectionToolbar.noteSuggestion.providerId).toBe("openai-default")
    expect(migrated.languageDetection.providerId).toBe("openai-default")
  })

  it("inserts missing fallback provider rows", () => {
    const migrated = migrate(hostedConfig())

    const ids = migrated.providersConfig.map((provider: any) => provider.id)
    expect(ids).toEqual([
      "google-translate-default",
      "microsoft-translate-default",
      "openai-default",
    ])

    const openai = migrated.providersConfig.find(
      (provider: any) => provider.id === "openai-default",
    )
    expect(openai).toMatchObject({ enabled: true, provider: "openai" })
    expect(openai.model).toMatchObject({ model: "gpt-5.6-luna", isCustomModel: false })

    const microsoft = migrated.providersConfig.find(
      (provider: any) => provider.id === "microsoft-translate-default",
    )
    expect(microsoft).toMatchObject({ enabled: true, provider: "microsoft-translate" })
  })

  it("re-enables a disabled fallback row so the config still validates", () => {
    const config = hostedConfig()
    config.providersConfig = [
      { id: "openai-default", name: "OpenAI", enabled: false, provider: "openai" },
    ]

    const migrated = migrate(config)

    expect(migrated.providersConfig[0]).toMatchObject({ id: "openai-default", enabled: true })
  })

  it("keeps existing enabled fallback rows untouched", () => {
    const config = hostedConfig()
    const openaiRow = { id: "openai-default", name: "My OpenAI", enabled: true, provider: "openai" }
    config.providersConfig = [openaiRow]

    const migrated = migrate(config)

    expect(migrated.providersConfig).toHaveLength(2)
    expect(migrated.providersConfig[0]).toBe(openaiRow)
  })

  it("keeps non-hosted provider ids and unrelated sections untouched during a rewrite", () => {
    const config = hostedConfig()
    config.pageTranslation.providerId = "google-translate-default"

    const migrated = migrate(config)

    // A non-hosted page translation id is not rewritten.
    expect(migrated.pageTranslation.providerId).toBe("google-translate-default")
    // A custom action already on a local provider keeps its identity.
    expect(migrated.selectionToolbar.customActions[1]).toBe(
      config.selectionToolbar.customActions[1],
    )
    // Existing provider rows keep their identity; fallback rows are appended.
    expect(migrated.providersConfig[0]).toBe(config.providersConfig[0])
  })

  it("is idempotent and returns a config without hosted ids by identity", () => {
    const config = hostedConfig()
    const migrated = migrate(config)
    const remigrated = migrate(migrated)

    expect(remigrated).toBe(migrated)

    const clean = { providersConfig: [], pageTranslation: { providerId: "openai-default" } }
    expect(migrate(clean)).toBe(clean)
  })

  it("returns configs it cannot rewrite untouched", () => {
    for (const config of [null, undefined, "nope", {}, { pageTranslation: {} }]) {
      expect(migrate(config)).toBe(config)
    }
  })
})
