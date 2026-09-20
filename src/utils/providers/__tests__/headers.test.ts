import { describe, expect, it } from "vitest"
import { getProviderHeadersWithOverride } from "../headers"

describe("provider headers", () => {
  it("sends the user's own headers for a provider with none forced", () => {
    expect(getProviderHeadersWithOverride("openai", { "X-Test": "1" })).toEqual({
      "X-Test": "1",
    })
  })

  it("sends nothing when a provider with none forced has no configured headers", () => {
    expect(getProviderHeadersWithOverride("openai", undefined)).toBeUndefined()
    expect(getProviderHeadersWithOverride("openai", {})).toBeUndefined()
  })

  it("filters empty and non-string header values", () => {
    expect(
      getProviderHeadersWithOverride("openai", {
        "X-Empty": "",
        "X-Count": 1,
        "X-Test": "1",
      }),
    ).toEqual({
      "X-Test": "1",
    })
  })

  describe("forced headers", () => {
    it("forces nothing for a former sponsorship provider", () => {
      // Jalapeno's partnership attribution headers are gone with the sponsor deal.
      expect(getProviderHeadersWithOverride("jalapenocloud", undefined)).toBeUndefined()
      expect(getProviderHeadersWithOverride("jalapenocloud", { "X-Test": "1" })).toEqual({
        "X-Test": "1",
      })
    })

    // Regression: this header used to be a config-time default, so adding any header of your own
    // dropped it — and Anthropic then refuses the request outright.
    it("keeps Anthropic's browser-access header when the user adds their own", () => {
      expect(getProviderHeadersWithOverride("anthropic", { "X-Test": "1" })).toEqual({
        "X-Test": "1",
        "anthropic-dangerous-direct-browser-access": "true",
      })
    })

    it("keeps OpenRouter attribution when the user adds their own", () => {
      expect(getProviderHeadersWithOverride("openrouter", { "X-Test": "1" })).toEqual({
        "X-Test": "1",
        // Attribution points at this open-source repository, never at the
        // upstream commercial website the fork no longer depends on.
        "HTTP-Referer": "https://github.com/yemangran/readbuddy",
        "X-OpenRouter-Title": "Read Frog",
      })
    })
  })
})
