// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ConfigHeader } from "../config-header"

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

describe("ConfigHeader", () => {
  it("links a provider's logo to its own canonical homepage", () => {
    render(<ConfigHeader providerType="jalapenocloud" />)

    expect(screen.getByRole("link", { name: /Jalapeno Cloud/ })).toHaveAttribute(
      "href",
      "https://www.jalapeno-cloud.ai",
    )
  })

  it("renders no sponsor call to action for a former sponsor without an API key", () => {
    render(<ConfigHeader providerType="jalapenocloud" />)

    expect(screen.queryByText("options.apiProviders.sponsorCta")).not.toBeInTheDocument()
    expect(
      screen.queryByText("options.apiProviders.sponsorCtaJalapenoCloud"),
    ).not.toBeInTheDocument()
  })

  it("redirects the tutorial link to the open source repository documentation", () => {
    render(<ConfigHeader providerType="azure" />)

    const tutorialLink = screen.getByText("options.apiProviders.howToConfigure")
    expect(tutorialLink.closest("a")).toHaveAttribute(
      "href",
      "https://github.com/yemangran/readbuddy#readme",
    )
  })

  it("renders tutorial link and logo link without upstream commercial domain", () => {
    render(<ConfigHeader providerType="openai-compatible" />)

    const links = screen.getAllByRole("link")
    expect(links.length).toBeGreaterThanOrEqual(1)
    for (const link of links) {
      expect(link.getAttribute("href")).not.toContain("readfrog.app")
    }
  })
})
