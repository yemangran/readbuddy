// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "@/utils/i18n"
import { WebdavSyncPage } from "../index"

const getWebdavConfigMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const saveWebdavConfigMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const clearWebdavConfigMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const testWebdavConnectionMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const getWebdavSyncStateMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const triggerWebdavSyncMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const getRemoteWebdavSummaryMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const watchWebdavSyncStateMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const requestWebdavHostPermissionMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())

vi.mock("@/utils/local-dictionary/client", () => ({
  getWebdavConfig: getWebdavConfigMock,
  saveWebdavConfig: saveWebdavConfigMock,
  clearWebdavConfig: clearWebdavConfigMock,
  testWebdavConnection: testWebdavConnectionMock,
  getWebdavSyncState: getWebdavSyncStateMock,
  triggerWebdavSync: triggerWebdavSyncMock,
  getRemoteWebdavSummary: getRemoteWebdavSummaryMock,
  watchWebdavSyncState: watchWebdavSyncStateMock,
}))

vi.mock("@/utils/local-dictionary/webdav", () => ({
  requestWebdavHostPermission: requestWebdavHostPermissionMock,
}))

function renderWithProviders(ui: React.ReactElement) {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("WebdavSyncPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWebdavConfigMock.mockResolvedValue(null)
    saveWebdavConfigMock.mockResolvedValue({ ok: true })
    clearWebdavConfigMock.mockResolvedValue({ ok: true })
    testWebdavConnectionMock.mockResolvedValue({ ok: true })
    getWebdavSyncStateMock.mockResolvedValue({
      phase: "idle",
      lastSuccessTime: null,
      lastAttemptTime: null,
      nextRetryTime: null,
      retryCount: 0,
      pendingChangesCount: 0,
      lastError: null,
      pausedReason: null,
    })
    triggerWebdavSyncMock.mockResolvedValue({ ok: true })
    getRemoteWebdavSummaryMock.mockResolvedValue({
      ok: true,
      summary: { exists: true, recordCount: 5, conflictCount: 0, updatedAt: 1000 },
    })
    watchWebdavSyncStateMock.mockReturnValue(() => {})
    requestWebdavHostPermissionMock.mockResolvedValue({ granted: true })
  })

  it("renders WebDAV section, allows configuration and testing connection", async () => {
    getWebdavConfigMock.mockResolvedValue({
      endpoint: "https://dav.example.com/webdav/",
      username: "myuser",
      password: "mypassword",
    })

    renderWithProviders(<WebdavSyncPage />)

    await waitFor(() => {
      expect(screen.getAllByText(i18n.t("options.dictionary.webdav.title")).length).toBeGreaterThan(
        0,
      )
      expect(screen.getByText(i18n.t("options.dictionary.webdav.connected"))).toBeInTheDocument()
    })

    const testBtn = screen.getByLabelText("webdav-test-connection")
    fireEvent.click(testBtn)

    await waitFor(() => {
      expect(testWebdavConnectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "https://dav.example.com/webdav/",
          username: "myuser",
        }),
      )
    })

    const syncBtn = screen.getByLabelText("webdav-sync-now")
    fireEvent.click(syncBtn)

    await waitFor(() => {
      expect(triggerWebdavSyncMock).toHaveBeenCalledTimes(1)
    })
  })

  it("displays sync status dashboard when configured", async () => {
    getWebdavConfigMock.mockResolvedValue({
      endpoint: "https://dav.example.com/webdav/",
      username: "myuser",
      password: "mypassword",
    })
    getWebdavSyncStateMock.mockResolvedValue({
      phase: "syncing",
      lastSuccessTime: 1700000000000,
      lastAttemptTime: 1700000001000,
      nextRetryTime: null,
      retryCount: 0,
      pendingChangesCount: 3,
      lastError: null,
      pausedReason: null,
    })

    renderWithProviders(<WebdavSyncPage />)

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.webdav.status"))).toBeInTheDocument()
      expect(screen.getByText(i18n.t("options.dictionary.webdav.phaseSyncing"))).toBeInTheDocument()
      expect(screen.getByText("3")).toBeInTheDocument()
    })
  })

  it("handles CONDITION_NOT_SUPPORTED with force overwrite confirmation dialog", async () => {
    getWebdavConfigMock.mockResolvedValue({
      endpoint: "https://dav.example.com/webdav/",
      username: "myuser",
      password: "mypassword",
    })
    getWebdavSyncStateMock.mockResolvedValue({
      phase: "paused",
      lastSuccessTime: null,
      lastAttemptTime: 1700000000000,
      nextRetryTime: null,
      retryCount: 1,
      pendingChangesCount: 1,
      lastError: {
        code: "CONDITION_NOT_SUPPORTED",
        message: "Server does not support conditional headers",
        retryable: false,
      },
      pausedReason: "CONDITION_NOT_SUPPORTED",
    })

    renderWithProviders(<WebdavSyncPage />)

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.webdav.phasePaused"))).toBeInTheDocument()
      expect(
        screen.getByText(i18n.t("options.dictionary.webdav.conditionNotSupported")),
      ).toBeInTheDocument()
      expect(screen.getByLabelText("webdav-force-overwrite")).toBeInTheDocument()
    })

    const overwriteBtn = screen.getByLabelText("webdav-force-overwrite")
    fireEvent.click(overwriteBtn)

    await waitFor(() => {
      expect(getRemoteWebdavSummaryMock).toHaveBeenCalledTimes(1)
      expect(
        screen.getByText(i18n.t("options.dictionary.webdav.forceOverwriteTitle")),
      ).toBeInTheDocument()
    })

    const confirmBtn = screen.getByLabelText("confirm-force-overwrite")
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(triggerWebdavSyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          forceUnconditional: true,
          resetPaused: true,
        }),
      )
    })
  })

  it("disables confirm button in force overwrite dialog if remote summary fails to load", async () => {
    getWebdavConfigMock.mockResolvedValue({
      endpoint: "https://dav.example.com/webdav/",
      username: "myuser",
      password: "mypassword",
    })
    getWebdavSyncStateMock.mockResolvedValue({
      phase: "paused",
      lastSuccessTime: null,
      lastAttemptTime: 1700000000000,
      nextRetryTime: null,
      retryCount: 1,
      pendingChangesCount: 1,
      lastError: {
        code: "CONDITION_NOT_SUPPORTED",
        message: "Server does not support conditional headers",
        retryable: false,
      },
      pausedReason: "CONDITION_NOT_SUPPORTED",
    })
    getRemoteWebdavSummaryMock.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Failed to connect", retryable: false },
    })

    renderWithProviders(<WebdavSyncPage />)

    await waitFor(() => {
      expect(screen.getByLabelText("webdav-force-overwrite")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText("webdav-force-overwrite"))

    await waitFor(() => {
      const confirmBtn = screen.getByLabelText("confirm-force-overwrite")
      expect(confirmBtn).toBeDisabled()
    })
  })

  it("supports Jianguoyun preset and inline remote snapshot inspection", async () => {
    getWebdavConfigMock.mockResolvedValue({
      endpoint: "https://dav.example.com/webdav/",
      username: "myuser",
      password: "mypassword",
    })
    getWebdavSyncStateMock.mockResolvedValue({
      phase: "idle",
      lastSuccessTime: 1700000000000,
      lastAttemptTime: null,
      nextRetryTime: null,
      retryCount: 0,
      pendingChangesCount: 0,
      lastError: null,
      pausedReason: null,
    })
    getRemoteWebdavSummaryMock.mockResolvedValue({
      ok: true,
      summary: { exists: true, recordCount: 42, conflictCount: 2, updatedAt: 1700000000000 },
    })

    renderWithProviders(<WebdavSyncPage />)

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.webdav.connected"))).toBeInTheDocument()
    })

    const endpointInput = screen.getByPlaceholderText<HTMLInputElement>(
      i18n.t("options.dictionary.webdav.endpointPlaceholder"),
    )
    // Initially locked / disabled when already configured
    expect(endpointInput).toBeDisabled()

    // Test connection is clickable while locked
    const testBtn = screen.getByLabelText("webdav-test-connection")
    expect(testBtn).toBeEnabled()

    // Click edit to unlock editing
    const editBtn = screen.getByLabelText("webdav-edit-settings")
    fireEvent.click(editBtn)
    expect(endpointInput).not.toBeDisabled()

    // Check preset button works in edit mode
    const presetBtn = screen.getByText(i18n.t("options.dictionary.webdav.presetJianguoyun"))
    fireEvent.click(presetBtn)
    expect(endpointInput.value).toBe("https://dav.jianguoyun.com/dav/")

    const usernameInput = screen.getByPlaceholderText("username")
    expect(document.activeElement).toBe(usernameInput)

    // Save configuration
    const saveBtn = screen.getByLabelText("webdav-save-settings")
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(saveWebdavConfigMock).toHaveBeenCalled()
      // After save, cannot directly edit anymore (locked)
      expect(endpointInput).toBeDisabled()
    })

    // After save, test connection is still clickable
    expect(testBtn).toBeEnabled()
    fireEvent.click(testBtn)
    await waitFor(() => {
      expect(testWebdavConnectionMock).toHaveBeenCalled()
    })

    // Open setup guide dialog
    const guideBtn = screen.getByLabelText("view-setup-guide")
    fireEvent.click(guideBtn)
    expect(
      screen.getByText(i18n.t("options.dictionary.webdav.setupGuideTitle")),
    ).toBeInTheDocument()

    // Check 0 pending changes label
    expect(
      screen.getByText(new RegExp(i18n.t("options.dictionary.webdav.allSynced"))),
    ).toBeInTheDocument()

    // Click toggle view remote snapshot
    const viewSnapshotBtn = screen.getByText(i18n.t("options.dictionary.webdav.viewRemoteSnapshot"))
    fireEvent.click(viewSnapshotBtn)

    await waitFor(() => {
      expect(getRemoteWebdavSummaryMock).toHaveBeenCalled()
      expect(screen.getByText("42")).toBeInTheDocument()
    })
  })

  it("restores saved configuration when canceling edit mode", async () => {
    getWebdavConfigMock.mockResolvedValue({
      endpoint: "https://dav.example.com/original/",
      username: "origuser",
      password: "origpassword",
    })

    renderWithProviders(<WebdavSyncPage />)

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.webdav.connected"))).toBeInTheDocument()
    })

    const endpointInput = screen.getByPlaceholderText<HTMLInputElement>(
      i18n.t("options.dictionary.webdav.endpointPlaceholder"),
    )
    expect(endpointInput.value).toBe("https://dav.example.com/original/")
    expect(endpointInput).toBeDisabled()

    // Click edit
    fireEvent.click(screen.getByLabelText("webdav-edit-settings"))
    expect(endpointInput).not.toBeDisabled()

    // Modify value
    fireEvent.change(endpointInput, { target: { value: "https://changed.example.com/" } })
    expect(endpointInput.value).toBe("https://changed.example.com/")

    // Click cancel
    fireEvent.click(screen.getByLabelText("webdav-cancel-edit"))

    // Restored to original and locked again
    expect(endpointInput.value).toBe("https://dav.example.com/original/")
    expect(endpointInput).toBeDisabled()
  })
})
