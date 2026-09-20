// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CSSEditor } from "../css-editor"

const testState = vi.hoisted(() => ({ atom: {} as object, value: null as any }))

vi.mock("jotai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jotai")>()
  return {
    ...actual,
    useAtom: (atom: object) => {
      if (atom !== testState.atom || !testState.value) {
        throw new Error("Unexpected atom")
      }
      return [testState.value, vi.fn<(...args: any[]) => any>()]
    },
  }
})

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: { pageTranslation: testState.atom },
}))

describe("translation CSSEditor", () => {
  it("renders no external documentation link", () => {
    testState.value = { translationNodeStyle: { customCSS: null } }
    render(<CSSEditor />)

    // The selector guidance lives in the editor's own placeholder, so no link is needed.
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})
