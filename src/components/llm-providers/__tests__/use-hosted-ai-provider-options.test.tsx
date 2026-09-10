// @vitest-environment jsdom
import type { ProviderSelectorOption } from "@/utils/providers/provider-display"
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useHostedAiProviderOptions } from "@/components/llm-providers/use-hosted-ai-provider-options"

describe("useHostedAiProviderOptions", () => {
  it("passes provider options through unchanged", () => {
    const localProvider = { id: "local-1", name: "Local" } as unknown as ProviderSelectorOption

    const { result } = renderHook(() => useHostedAiProviderOptions("customAction", [localProvider]))

    expect(result.current).toEqual([localProvider])
  })
})
