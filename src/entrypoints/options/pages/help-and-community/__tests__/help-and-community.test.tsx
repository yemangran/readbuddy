// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HelpAndCommunityPage } from "../index"

vi.mock("#imports", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("../../../components/page-layout", () => ({
  PageLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

vi.mock("../../../components/config-section", () => ({
  ConfigSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section data-section={title}>{children}</section>
  ),
}))

describe("HelpAndCommunityPage", () => {
  it("renders all help and community links pointing to read-toad repository", () => {
    render(<HelpAndCommunityPage />)

    const links = screen.getAllByRole("link")
    expect(links.length).toBeGreaterThanOrEqual(6)

    for (const link of links) {
      const href = link.getAttribute("href") ?? ""
      expect(href).toMatch(/^https:\/\/github\.com\/yemangran\/read-toad/)
      expect(href).not.toContain("readfrog.app")
      expect(href).not.toContain("discord.gg")
      expect(href).not.toContain("tally.so")
    }
  })
})
