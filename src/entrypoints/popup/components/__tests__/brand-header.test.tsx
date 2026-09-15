// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { PopupBrandHeader } from "../brand-header"

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => (key === "name" ? "伴读书童" : key),
  },
}))

describe("PopupBrandHeader", () => {
  it("renders brand logo and title", () => {
    render(<PopupBrandHeader />)
    expect(screen.getByText("伴读书童")).toBeInTheDocument()
    const img = screen.getByRole("img", { name: "伴读书童" })
    expect(img).toBeInTheDocument()
  })
})
