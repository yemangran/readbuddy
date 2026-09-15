// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App, { POPUP_ACTIVE_TAB_STORAGE_KEY } from "../app"

const openOptionsPageMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
vi.mock("@/utils/navigation", () => ({
  openOptionsPage: openOptionsPageMock,
}))

// Mock subcomponents
vi.mock("../components/brand-header", () => ({
  PopupBrandHeader: () => <div data-testid="brand-header">BrandHeader</div>,
}))
vi.mock("../components/translation-hub-button", () => ({
  TranslationHubButton: () => <div data-testid="translation-hub">Hub</div>,
}))
vi.mock("../components/discord-button", () => ({
  DiscordButton: () => <div data-testid="discord">Discord</div>,
}))
vi.mock("../components/blog-notification", () => ({
  default: () => <div data-testid="blog">Blog</div>,
}))
vi.mock("../components/language-options-selector", () => ({
  default: () => <div data-testid="language-options">Languages</div>,
}))
vi.mock("../components/providers-field", () => ({
  default: () => <div data-testid="providers-field">Providers</div>,
}))
vi.mock("../components/translate-prompt-selector", () => ({
  default: () => <div data-testid="translate-prompt">Prompts</div>,
}))
vi.mock("../components/translation-mode-selector", () => ({
  default: () => <div data-testid="translation-mode">Mode</div>,
}))
vi.mock("../components/translate-button", () => ({
  default: () => <div data-testid="translate-button">Translate</div>,
}))
vi.mock("../components/site-control-toggle", () => ({
  SiteControlToggle: () => <div data-testid="site-control">SiteControl</div>,
}))
vi.mock("../components/always-translate", () => ({
  AlwaysTranslate: () => <div data-testid="always-translate">AlwaysTranslate</div>,
}))
vi.mock("../components/node-translation-hotkey-selector", () => ({
  default: () => <div data-testid="hotkey">Hotkey</div>,
}))
vi.mock("../components/ai-smart-context", () => ({
  AISmartContext: () => <div data-testid="smart-context">SmartContext</div>,
}))
vi.mock("../components/more-menu", () => ({
  MoreMenu: () => <div data-testid="more-menu">More</div>,
}))

// Mock TanStack query
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      ok: true,
      data: {
        records: [
          {
            id: "rec-1",
            createdAt: 1000,
            updatedAt: 1000,
            deviceId: "dev-1",
            deletedAt: null,
            localRevision: "rev-1",
            actionId: "act-1",
            actionName: "Dictionary",
            outputSchema: [],
            result: {},
            columns: [{ id: "col-1", name: "单词", position: 0 }],
            mappings: [],
            cells: { "col-1": "testword" },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 500,
      },
    },
    isLoading: false,
  }),
}))

import { storage } from "#imports"

// Mock storage
const mockStorageMap = new Map<string, unknown>()

// Mock reviewStore
vi.mock("@/utils/review/store", () => ({
  reviewStore: {
    getDueCount: vi.fn<() => Promise<number>>().mockResolvedValue(5),
    buildReviewQueue: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    submitRating: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}),
  },
}))

describe("Popup App Component", () => {
  beforeEach(() => {
    mockStorageMap.clear()
    storage.getItem = vi.fn<(...args: any[]) => Promise<any>>(
      async (key: string) => (mockStorageMap.get(key) as any) ?? null,
    )
    storage.setItem = vi.fn<(...args: any[]) => Promise<void>>(
      async (key: string, val: unknown) => {
        mockStorageMap.set(key, val)
      },
    )
  })

  it("renders with translation tab active by default and displays due count badge", async () => {
    render(<App />)

    expect(screen.getByText("翻译配置")).toBeInTheDocument()
    expect(screen.getByText("本地学习")).toBeInTheDocument()
    expect(screen.getByTestId("language-options")).toBeInTheDocument()

    // Due count badge should be visible once loaded
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument()
    })
  })

  it("switches to learning tab and persists selection to storage", async () => {
    render(<App />)

    // Click "本地学习" tab
    fireEvent.click(screen.getByText("本地学习"))

    // Translation controls should be hidden, learning tab should be active
    expect(screen.queryByTestId("language-options")).not.toBeInTheDocument()
    expect(screen.getByText(/本地词典复习/i)).toBeInTheDocument()

    // Should persist to storage
    await waitFor(() => {
      expect(mockStorageMap.get(POPUP_ACTIVE_TAB_STORAGE_KEY)).toBe("learning")
    })
  })

  it("restores previously persisted tab on mount", async () => {
    mockStorageMap.set(POPUP_ACTIVE_TAB_STORAGE_KEY, "learning")

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/本地词典复习/i)).toBeInTheDocument()
    })
    expect(screen.queryByTestId("language-options")).not.toBeInTheDocument()
  })

  it("navigates to options review mode when clicking fullscreen review button", async () => {
    mockStorageMap.set(POPUP_ACTIVE_TAB_STORAGE_KEY, "learning")

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /在独立页面中全屏复习/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /在独立页面中全屏复习/i }))
    expect(openOptionsPageMock).toHaveBeenCalledWith({ route: "/dictionary?mode=review" })
  })
})
