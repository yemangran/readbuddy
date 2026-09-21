// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "@/utils/i18n"
import { ConfigManagementSection } from "../index"

const getWebdavConfigMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const getWebdavSyncStateMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const triggerWebdavSyncMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const watchWebdavSyncStateMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())

vi.mock("@/utils/local-dictionary/client", () => ({
  getWebdavConfig: getWebdavConfigMock,
  getWebdavSyncState: getWebdavSyncStateMock,
  triggerWebdavSync: triggerWebdavSyncMock,
  watchWebdavSyncState: watchWebdavSyncStateMock,
}))

function renderSection() {
  const testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter>
        <ConfigManagementSection />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const CONFIGURED_WEBDAV = {
  endpoint: "https://dav.example.com/webdav/",
  username: "user",
  password: "pass",
}

describe("ConfigManagementSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWebdavConfigMock.mockResolvedValue(CONFIGURED_WEBDAV)
    getWebdavSyncStateMock.mockResolvedValue({
      phase: "idle",
      lastSuccessTime: 1700000000000,
      lastAttemptTime: null,
      nextRetryTime: null,
      retryCount: 0,
      pendingChangesCount: 0,
      lastError: null,
      pausedReason: null,
      configSyncStatus: "synced",
      configLastSuccessTime: 1700000000000,
      configLastAction: "uploaded",
      configLastError: null,
    })
    triggerWebdavSyncMock.mockResolvedValue({ ok: true })
    watchWebdavSyncStateMock.mockReturnValue(() => {})
  })

  it("presents the unified WebDAV sync entry with connection status and last sync time", async () => {
    renderSection()

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.webdav.connected"))).toBeInTheDocument()
    })

    expect(
      screen.getByText(new RegExp(i18n.t("options.dictionary.webdav.lastSync"))),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("webdav-sync-now")).toBeEnabled()
    // The entry drills into the detail page, which holds the full sync status.
    expect(screen.getByLabelText("webdav-sync-detail")).toHaveAttribute(
      "href",
      "/preference/webdav-sync",
    )
  })

  it("no longer renders the Google Drive sync card or its conflict dialog", async () => {
    renderSection()

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.webdav.connected"))).toBeInTheDocument()
    })

    expect(
      screen.queryByText(i18n.t("options.preference.config.googleDrive.title")),
    ).not.toBeInTheDocument()
    expect(document.getElementById("google-drive-sync")).toBeNull()
    expect(
      screen.queryByText(i18n.t("options.preference.config.googleDrive.sync")),
    ).not.toBeInTheDocument()
  })

  it("keeps every core preference config row", async () => {
    renderSection()

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.webdav.title"))).toBeInTheDocument()
    })

    // Manual import/export and the raw JSON view
    expect(
      screen.getByText(i18n.t("options.preference.config.manualSync.title")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.preference.config.manualSync.import")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.preference.config.manualSync.export")),
    ).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.preference.config.viewConfig.open")),
    ).toBeInTheDocument()
    // WebDAV detail page entry
    expect(screen.getByText(i18n.t("options.dictionary.webdav.title"))).toBeInTheDocument()
    // Config backup page entry
    expect(screen.getByText(i18n.t("options.preference.config.backup.title"))).toBeInTheDocument()
    // Reset to defaults
    expect(screen.getByText(i18n.t("options.preference.config.reset.title"))).toBeInTheDocument()
    expect(
      screen.getByText(i18n.t("options.preference.config.reset.dialog.trigger")),
    ).toBeInTheDocument()
  })

  it("runs one unified pass covering dictionary, reviews and preferences", async () => {
    renderSection()

    await waitFor(() => {
      expect(screen.getByLabelText("webdav-sync-now")).toBeEnabled()
    })

    fireEvent.click(screen.getByLabelText("webdav-sync-now"))

    await waitFor(() => {
      expect(triggerWebdavSyncMock).toHaveBeenCalledTimes(1)
    })
    // One coordinated pass, not a preferences-only one: the same trigger the
    // detail page's "Sync Now" uses.
    expect(triggerWebdavSyncMock).toHaveBeenCalledWith({ reason: "manual" })
  })

  it("blocks the sync action until WebDAV is configured", async () => {
    getWebdavConfigMock.mockResolvedValue(null)

    renderSection()

    await waitFor(() => {
      expect(
        screen.getByText(i18n.t("options.dictionary.webdav.notConfigured")),
      ).toBeInTheDocument()
    })

    expect(screen.getByLabelText("webdav-sync-now")).toBeDisabled()
    expect(
      screen.queryByText(new RegExp(i18n.t("options.dictionary.webdav.lastSync"))),
    ).not.toBeInTheDocument()
  })
})
