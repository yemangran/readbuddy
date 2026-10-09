// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiProvidersSyncStatus } from "../api-providers-sync-status"

const mockGetWebdavConfig = vi.hoisted(() => vi.fn<() => any>())
const mockSyncPreferencesWithWebdav = vi.hoisted(() => vi.fn<() => any>())
const mockUseWebdavSyncState = vi.hoisted(() => vi.fn<() => any>())

vi.mock("@/utils/local-dictionary/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/local-dictionary/client")>()
  return {
    ...actual,
    getWebdavConfig: () => mockGetWebdavConfig(),
    syncPreferencesWithWebdav: () => mockSyncPreferencesWithWebdav(),
  }
})

vi.mock("../../preference/webdav-sync/use-webdav-sync-state", () => ({
  useWebdavSyncState: () => mockUseWebdavSyncState(),
}))

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>()
  return {
    ...actual,
    useQuery: () => ({
      data: mockGetWebdavConfig(),
      isLoading: false,
    }),
  }
})

describe("ApiProvidersSyncStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWebdavSyncState.mockReturnValue(null)
  })

  it("renders unconfigured banner when WebDAV is not set up", () => {
    mockGetWebdavConfig.mockReturnValue(null)

    render(
      <MemoryRouter>
        <ApiProvidersSyncStatus />
      </MemoryRouter>,
    )

    expect(screen.getByText("options.apiProviders.sync.title")).toBeInTheDocument()
    expect(screen.getByText("options.apiProviders.sync.goToSettings")).toBeInTheDocument()
  })

  it("renders configured sync card and handles manual sync", async () => {
    mockGetWebdavConfig.mockReturnValue({
      endpoint: "https://dav.example.com",
      username: "user",
    })
    mockUseWebdavSyncState.mockReturnValue({
      configSyncStatus: "synced",
      configLastSuccessTime: 1700000000000,
    })
    mockSyncPreferencesWithWebdav.mockResolvedValue({
      ok: true,
      components: { config: { action: "uploaded" } },
    })

    render(
      <MemoryRouter>
        <ApiProvidersSyncStatus />
      </MemoryRouter>,
    )

    expect(screen.getByText("options.apiProviders.sync.title")).toBeInTheDocument()
    const syncButton = screen.getByRole("button", { name: "sync-preferences-button" })
    expect(syncButton).toBeInTheDocument()

    fireEvent.click(syncButton)

    await waitFor(() => {
      expect(mockSyncPreferencesWithWebdav).toHaveBeenCalledTimes(1)
    })
  })
})
