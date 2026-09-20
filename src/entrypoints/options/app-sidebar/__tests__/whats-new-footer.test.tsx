// @vitest-environment jsdom
import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GITHUB_REPO_URL } from "@/utils/constants/app"
import { version } from "../../../../../package.json"
import { WhatsNewFooter } from "../whats-new-footer"

vi.mock("#imports", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("@iconify/react", () => ({
  Icon: ({ className, icon }: { className?: string; icon: string }) => (
    <span
      aria-hidden="true"
      className={className}
      data-icon={icon}
      data-testid="whats-new-footer-icon"
    />
  ),
}))

vi.mock("@/components/ui/base-ui/sidebar", () => ({
  SidebarMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/base-ui/popover", async () => {
  const React = await import("react")

  interface PopoverContextValue {
    open: boolean
    onOpenChange?: (open: boolean) => void
  }

  const PopoverContext = React.createContext<PopoverContextValue | null>(null)

  function usePopoverContext() {
    const context = React.use(PopoverContext)
    if (!context) {
      throw new Error("Popover components must be used within Popover.")
    }
    return context
  }

  function Popover({
    children,
    open = false,
    onOpenChange,
  }: {
    children: ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) {
    const contextValue = React.useMemo(() => ({ open, onOpenChange }), [open, onOpenChange])
    return <PopoverContext value={contextValue}>{children}</PopoverContext>
  }

  function PopoverTrigger({
    children,
    render: renderElement,
  }: {
    children: ReactNode
    render?: React.ReactElement<React.ComponentProps<"button">>
  }) {
    const { open, onOpenChange } = usePopoverContext()

    if (renderElement && React.isValidElement(renderElement)) {
      const originalOnClick = renderElement.props.onClick

      return React.cloneElement(renderElement, {
        children,
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          originalOnClick?.(event)
          onOpenChange?.(!open)
        },
      })
    }

    return (
      <button type="button" onClick={() => onOpenChange?.(!open)}>
        {children}
      </button>
    )
  }

  function PopoverContent({ children }: { children: ReactNode }) {
    const { open } = usePopoverContext()
    return open ? <div data-testid="whats-new-popover-content">{children}</div> : null
  }

  return {
    Popover,
    PopoverContent,
    PopoverDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    PopoverHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    PopoverTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    PopoverTrigger,
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("whatsNewFooter", () => {
  it("renders the static What's New trigger button without auto-opening", () => {
    render(<WhatsNewFooter />)

    const trigger = screen.getByRole("button", { name: "options.whatsNew.title" })
    expect(trigger).toBeInTheDocument()
    expect(screen.queryByTestId("whats-new-popover-content")).not.toBeInTheDocument()
  })

  it("opens the static local changelog popover on click and shows version", () => {
    render(<WhatsNewFooter />)

    const trigger = screen.getByRole("button", { name: "options.whatsNew.title" })
    fireEvent.click(trigger)

    expect(screen.getByTestId("whats-new-popover-content")).toBeInTheDocument()
    expect(screen.getByText(`v${version}`)).toBeInTheDocument()
  })

  it("links to GitHub Releases and contains no commercial blog links or network fetches", () => {
    render(<WhatsNewFooter />)

    const trigger = screen.getByRole("button", { name: "options.whatsNew.title" })
    fireEvent.click(trigger)

    const releaseLink = screen.getByRole("link", { name: /releases/i })
    expect(releaseLink).toHaveAttribute("href", `${GITHUB_REPO_URL}/releases`)
    expect(releaseLink).toHaveAttribute("target", "_blank")

    // Ensure no commercial blog links
    const allLinks = screen.getAllByRole("link")
    for (const link of allLinks) {
      expect(link.getAttribute("href")).not.toContain("readfrog.app")
      expect(link.getAttribute("href")).not.toContain("/api/blog")
    }
  })
})
