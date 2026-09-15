import type { PromptableProviderRef, SerializableProviderRef } from "../provider-ref"
import type { LLMProviderConfig, TranslateProviderConfig } from "@/types/config/provider"
import { describe, expect, expectTypeOf, it } from "vitest"
import { DEFAULT_PROVIDER_CONFIG } from "@/utils/constants/providers"
import {
  canProviderRefGenerateText,
  canResolvedProviderRefGenerateText,
  getProviderCacheIdentity,
  resolvePageTranslationProvider,
  serializeProviderRef,
} from "../provider-ref"
import { resolveProviderRefForCapability } from "../provider-registry"

const localLLMRef = {
  kind: "local" as const,
  config: { ...DEFAULT_PROVIDER_CONFIG.openai } as LLMProviderConfig,
  id: DEFAULT_PROVIDER_CONFIG.openai.id,
  name: "OpenAI",
}

const localTranslateRef = {
  kind: "local" as const,
  config: {
    ...DEFAULT_PROVIDER_CONFIG["microsoft-translate"],
  } as TranslateProviderConfig,
  id: DEFAULT_PROVIDER_CONFIG["microsoft-translate"].id,
  name: "Microsoft Translator",
}

describe("serializeProviderRef", () => {
  it("returns a local ref carrying the resolved config", () => {
    const ref = serializeProviderRef(localLLMRef)

    expect(ref).toEqual({ kind: "local", config: { ...DEFAULT_PROVIDER_CONFIG.openai } })
    expectTypeOf(serializeProviderRef(localLLMRef)).toEqualTypeOf<PromptableProviderRef>()
    expectTypeOf(serializeProviderRef(localTranslateRef)).toEqualTypeOf<SerializableProviderRef>()
  })

  it("preserves promptability through the overloads", () => {
    const promptable = serializeProviderRef(localLLMRef)
    expect(canProviderRefGenerateText(promptable)).toBe(true)

    const serializable = serializeProviderRef(localTranslateRef)
    expect(canProviderRefGenerateText(serializable)).toBe(false)
  })
})

describe("getProviderCacheIdentity", () => {
  it("hashes the whole config so a changed key invalidates", () => {
    const base = getProviderCacheIdentity(serializeProviderRef(localLLMRef))
    const changed = getProviderCacheIdentity({
      kind: "local",
      config: { ...DEFAULT_PROVIDER_CONFIG.openai, temperature: 0.9 },
    })

    expect(base).not.toEqual(changed)
    expect(base).toBe(JSON.stringify(DEFAULT_PROVIDER_CONFIG.openai))
  })
})

describe("canResolvedProviderRefGenerateText", () => {
  it("accepts LLM configs and refuses pure translate configs", () => {
    expect(canResolvedProviderRefGenerateText(localLLMRef)).toBe(true)
    expect(canResolvedProviderRefGenerateText(localTranslateRef)).toBe(false)
  })
})

describe("resolvePageTranslationProvider", () => {
  it("resolves the configured provider or throws", () => {
    const config = {
      providersConfig: [DEFAULT_PROVIDER_CONFIG.openai],
      pageTranslation: { providerId: DEFAULT_PROVIDER_CONFIG.openai.id },
    } as never

    expect(resolvePageTranslationProvider(config).id).toBe(DEFAULT_PROVIDER_CONFIG.openai.id)

    const brokenConfig = {
      providersConfig: [],
      pageTranslation: { providerId: DEFAULT_PROVIDER_CONFIG.openai.id },
    } as never

    expect(() => resolvePageTranslationProvider(brokenConfig)).toThrow(
      `No page translation provider for id "${DEFAULT_PROVIDER_CONFIG.openai.id}"`,
    )
  })
})

describe("resolveProviderRefForCapability", () => {
  it("returns null for a capability the provider cannot run", () => {
    expect(
      resolveProviderRefForCapability(
        "customAction",
        [DEFAULT_PROVIDER_CONFIG["microsoft-translate"]],
        DEFAULT_PROVIDER_CONFIG["microsoft-translate"].id,
      ),
    ).toBeNull()

    expect(
      resolveProviderRefForCapability(
        "customAction",
        [DEFAULT_PROVIDER_CONFIG.openai],
        DEFAULT_PROVIDER_CONFIG.openai.id,
      )?.kind,
    ).toBe("local")
  })
})
