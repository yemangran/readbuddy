// @vitest-environment jsdom

import type { APIProviderTypes } from "@/types/config/provider"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ConfigHeader } from "../config-header"

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

describe("ConfigHeader", () => {
  it("links a provider's logo to its own canonical homepage", () => {
    render(<ConfigHeader providerType="jalapenocloud" />)

    expect(screen.getByRole("link")).toHaveAttribute("href", "https://www.jalapeno-cloud.ai")
  })

  it("renders no sponsor call to action for a former sponsor without an API key", () => {
    render(<ConfigHeader providerType="jalapenocloud" />)

    expect(screen.queryByText("options.apiProviders.sponsorCta")).not.toBeInTheDocument()
    expect(
      screen.queryByText("options.apiProviders.sponsorCtaJalapenoCloud"),
    ).not.toBeInTheDocument()
  })

  it("renders no external tutorial link for any provider", () => {
    for (const providerType of ["azure", "openrouter", "deepl"] as APIProviderTypes[]) {
      const { unmount } = render(<ConfigHeader providerType={providerType} />)

      expect(screen.queryByText("options.apiProviders.howToConfigure")).not.toBeInTheDocument()
      unmount()
    }
  })

  it("renders no link at all for the protocol adapters, whose guidance is local", () => {
    render(<ConfigHeader providerType="openai-compatible" />)

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})
