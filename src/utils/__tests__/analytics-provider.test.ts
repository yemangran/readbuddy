import type { ProviderConfig } from "@/types/config/provider"
import { describe, expect, it } from "vitest"
import {
  BUILT_IN_AI_FEATURE_PROVIDER,
  classifyProviderConfig,
  classifyResolvedProvider,
  EDGE_TTS_FEATURE_PROVIDER,
  normalizeFeatureProviderAnalytics,
  UNKNOWN_FEATURE_PROVIDER,
} from "@/utils/analytics-provider"

const openAIProvider = {
  id: "openai-provider-id",
  name: "Private provider name",
  enabled: true,
  provider: "openai",
  model: {
    model: "gpt-5.4-mini",
    isCustomModel: false,
    customModel: null,
  },
} satisfies ProviderConfig

const googleTranslateProvider = {
  id: "google-translate-provider-id",
  name: "Another private provider name",
  enabled: true,
  provider: "google-translate",
} satisfies ProviderConfig

describe("feature provider analytics", () => {
  it("classifies configured LLM providers using only their canonical provider type", () => {
    expect(classifyProviderConfig(openAIProvider)).toEqual({
      provider: "openai",
      backend_kind: "llm",
    })
  })

  it("classifies standard translation providers as non-LLM", () => {
    expect(classifyProviderConfig(googleTranslateProvider)).toEqual({
      provider: "google-translate",
      backend_kind: "non_llm",
    })
  })

  it("still normalizes the historical built-in provider analytics name", () => {
    // Events recorded before the hosted providers were removed carry this
    // value; normalization keeps accepting them.
    expect(normalizeFeatureProviderAnalytics("read-frog-built-in-ai", "llm")).toEqual(
      BUILT_IN_AI_FEATURE_PROVIDER,
    )
    expect(BUILT_IN_AI_FEATURE_PROVIDER).toEqual({
      provider: "read-frog-built-in-ai",
      backend_kind: "llm",
    })
  })

  it("classifies Edge TTS as a non-LLM backend", () => {
    expect(EDGE_TTS_FEATURE_PROVIDER).toEqual({
      provider: "edge-tts",
      backend_kind: "non_llm",
    })
  })

  it("uses unknown/unknown for missing providers and invalid runtime combinations", () => {
    expect(classifyProviderConfig(null)).toEqual(UNKNOWN_FEATURE_PROVIDER)
    expect(classifyResolvedProvider(undefined)).toEqual(UNKNOWN_FEATURE_PROVIDER)
    expect(normalizeFeatureProviderAnalytics("openai", "non_llm")).toEqual(UNKNOWN_FEATURE_PROVIDER)
    expect(normalizeFeatureProviderAnalytics("not-a-provider", "llm")).toEqual(
      UNKNOWN_FEATURE_PROVIDER,
    )
  })
})
