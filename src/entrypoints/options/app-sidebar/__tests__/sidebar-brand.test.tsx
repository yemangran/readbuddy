// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { SidebarBrandHeader } from "../sidebar-brand"

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => {
      if (key === "name") return "伴读蛤蟆"
      if (key === "options.sidebar.settings") return "设置"
      return key
    },
  },
}))

describe("SidebarBrandHeader", () => {
  it("renders brand logo and title", () => {
    render(<SidebarBrandHeader />)
    expect(screen.getByText("伴读蛤蟆")).toBeInTheDocument()
    expect(screen.getByText("设置")).toBeInTheDocument()
    const img = screen.getByRole("img", { name: "伴读蛤蟆" })
    expect(img).toBeInTheDocument()
  })
})
