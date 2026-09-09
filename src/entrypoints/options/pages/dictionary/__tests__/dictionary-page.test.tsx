import type {
  LocalDictionaryRecord,
  PortableDictionaryRecord,
} from "@/utils/local-dictionary/types"
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { saveAs } from "file-saver"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "@/utils/i18n"
import { DictionaryPage } from "../index"

const listRecordsMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const updateCellsMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const deleteRecordMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const watchSignalMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const exportSnapshotMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const previewImportMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const commitImportMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const listConflictsMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const restoreConflictMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const getWebdavConfigMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const saveWebdavConfigMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const clearWebdavConfigMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const testWebdavConnectionMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const syncWebdavMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const getWebdavSyncStateMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const triggerWebdavSyncMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const getRemoteWebdavSummaryMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const watchWebdavSyncStateMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())

vi.mock("file-saver", () => ({
  saveAs: vi.fn<() => void>(),
}))

vi.mock("@/utils/local-dictionary/client", () => ({
  listDictionaryRecords: listRecordsMock,
  updateDictionaryCells: updateCellsMock,
  deleteDictionaryRecord: deleteRecordMock,
  watchDictionaryChangeSignal: watchSignalMock,
  exportDictionarySnapshot: exportSnapshotMock,
  previewDictionaryImport: previewImportMock,
  commitDictionaryImport: commitImportMock,
  listConflictVersions: listConflictsMock,
  restoreConflictVersionAsNew: restoreConflictMock,
  getWebdavConfig: getWebdavConfigMock,
  saveWebdavConfig: saveWebdavConfigMock,
  clearWebdavConfig: clearWebdavConfigMock,
  testWebdavConnection: testWebdavConnectionMock,
  syncWebdav: syncWebdavMock,
  getWebdavSyncState: getWebdavSyncStateMock,
  triggerWebdavSync: triggerWebdavSyncMock,
  getRemoteWebdavSummary: getRemoteWebdavSummaryMock,
  watchWebdavSyncState: watchWebdavSyncStateMock,
}))

const mockRecords: LocalDictionaryRecord[] = [
  {
    id: "rec-1",
    createdAt: 1000,
    updatedAt: 2000,
    deviceId: "dev-1",
    localRevision: "rev-1",
    actionId: "default-dictionary",
    actionName: "Dictionary",
    outputSchema: [],
    result: {},
    columns: [
      { id: "c-term", name: "Term", position: 0 },
      { id: "c-def", name: "Definition", position: 1 },
    ],
    mappings: [],
    cells: {
      "c-term": "frog",
      "c-def": "an amphibian",
    },
  },
]

function renderWithQuery(ui: React.ReactElement) {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>)
}

describe("DictionaryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    watchSignalMock.mockReturnValue(() => {})
    listRecordsMock.mockResolvedValue({
      ok: true,
      data: { records: mockRecords, total: 1, page: 1, pageSize: 15 },
      changeSequence: 1,
    })
    listConflictsMock.mockResolvedValue({
      ok: true,
      data: [],
      changeSequence: 1,
    })
    getWebdavConfigMock.mockResolvedValue(null)
    saveWebdavConfigMock.mockResolvedValue({ ok: true })
    clearWebdavConfigMock.mockResolvedValue({ ok: true })
    testWebdavConnectionMock.mockResolvedValue({ ok: true })
    syncWebdavMock.mockResolvedValue({ ok: true })
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
  })

  it("renders empty state when there are no records", async () => {
    listRecordsMock.mockResolvedValue({
      ok: true,
      data: { records: [], total: 0, page: 1, pageSize: 15 },
      changeSequence: 0,
    })

    renderWithQuery(<DictionaryPage />)

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.emptyTitle"))).toBeInTheDocument()
    })
  })

  it("renders records and columns correctly", async () => {
    renderWithQuery(<DictionaryPage />)

    await waitFor(() => {
      expect(screen.getByText("frog")).toBeInTheDocument()
      expect(screen.getByText("an amphibian")).toBeInTheDocument()
      expect(screen.getByText("Dictionary")).toBeInTheDocument()
    })
  })

  it("handles export snapshot button click", async () => {
    exportSnapshotMock.mockResolvedValue({
      ok: true,
      data: '{"format":"readfrog-local","version":1}',
      changeSequence: 1,
    })

    renderWithQuery(<DictionaryPage />)

    const exportBtn = screen.getByLabelText("export-snapshot")
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(exportSnapshotMock).toHaveBeenCalledTimes(1)
      expect(saveAs).toHaveBeenCalledTimes(1)
    })
  })

  it("opens history modal and restores a conflict version as new", async () => {
    const conflictRecord: PortableDictionaryRecord = {
      id: "rec-1",
      createdAt: 1000,
      updatedAt: 1500,
      deviceId: "dev-prev",
      actionId: "default-dictionary",
      actionName: "Dictionary",
      outputSchema: [],
      result: {},
      columns: [{ id: "c-term", name: "Term", position: 0 }],
      mappings: [],
      cells: { "c-term": "frog-old-version" },
    }

    listConflictsMock.mockResolvedValue({
      ok: true,
      data: [conflictRecord],
      changeSequence: 1,
    })

    restoreConflictMock.mockResolvedValue({
      ok: true,
      data: { ...conflictRecord, id: "rec-new", localRevision: "new-rev" },
      changeSequence: 2,
    })

    renderWithQuery(<DictionaryPage />)

    await waitFor(() => {
      expect(screen.getByText("frog")).toBeInTheDocument()
    })

    const historyBtn = screen.getByLabelText("history-record")
    fireEvent.click(historyBtn)

    await waitFor(() => {
      expect(screen.getByText("dev-prev")).toBeInTheDocument()
      expect(screen.getByText("frog-old-version")).toBeInTheDocument()
    })

    const restoreBtn = screen.getByText(i18n.t("options.dictionary.restoreAsNew"))
    fireEvent.click(restoreBtn)

    await waitFor(() => {
      expect(restoreConflictMock).toHaveBeenCalledWith(
        expect.objectContaining({
          versionId: {
            id: "rec-1",
            updatedAt: 1500,
            deviceId: "dev-prev",
          },
        }),
      )
    })
  })

  it("opens edit modal and preserves numeric type when updating cells", async () => {
    const recordWithNumber: LocalDictionaryRecord = {
      id: "rec-num-1",
      createdAt: 1000,
      updatedAt: 2000,
      deviceId: "dev-1",
      localRevision: "rev-1",
      actionId: "custom-action",
      actionName: "Analysis",
      outputSchema: [],
      result: {},
      columns: [
        { id: "c-term", name: "Term", position: 0 },
        { id: "c-count", name: "Count", position: 1, config: { type: "number" } },
      ],
      mappings: [],
      cells: {
        "c-term": "frog",
        "c-count": 42,
      },
    }

    listRecordsMock.mockResolvedValue({
      ok: true,
      data: { records: [recordWithNumber], total: 1, page: 1, pageSize: 15 },
      changeSequence: 1,
    })

    updateCellsMock.mockResolvedValue({
      ok: true,
      data: recordWithNumber,
      changeSequence: 2,
    })

    renderWithQuery(<DictionaryPage />)

    await waitFor(() => {
      expect(screen.getByText("frog")).toBeInTheDocument()
    })

    const editBtn = screen.getByLabelText("edit-record")
    fireEvent.click(editBtn)

    expect(screen.getByText(i18n.t("options.dictionary.editTitle"))).toBeInTheDocument()

    const countInput = screen.getByDisplayValue("42")
    fireEvent.change(countInput, { target: { value: "99" } })

    const saveBtn = screen.getByText(i18n.t("options.dictionary.save"))
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(updateCellsMock).toHaveBeenCalledTimes(1)
    })

    const callArgs = updateCellsMock.mock.calls[0]?.[0]
    expect(callArgs.cells["c-count"]).toBe(99)
    expect(typeof callArgs.cells["c-count"]).toBe("number")
    expect(callArgs.cells["c-term"]).toBe("frog")
  })

  it("handles import preview and confirmation", async () => {
    previewImportMock.mockResolvedValue({
      ok: true,
      data: {
        addedCount: 2,
        updatedCount: 1,
        deletedCount: 0,
        preservedCount: 0,
        unchangedCount: 0,
        addedConflictCount: 0,
        expectedSequence: 5,
        snapshotHash: "hash-123",
        errors: [],
      },
      changeSequence: 5,
    })

    commitImportMock.mockResolvedValue({
      ok: true,
      data: {
        addedCount: 2,
        updatedCount: 1,
        deletedCount: 0,
        preservedCount: 0,
        addedConflictCount: 0,
      },
      changeSequence: 6,
    })

    renderWithQuery(<DictionaryPage />)

    const importBtn = screen.getByLabelText("import-snapshot")
    fireEvent.click(importBtn)

    expect(screen.getByText(i18n.t("options.dictionary.importTitle"))).toBeInTheDocument()

    const validSnapshot = {
      format: "readfrog-local",
      version: 1,
      updatedAt: Date.now(),
      vocabularies: [],
      conflictVersions: [],
    }

    const file = new File([JSON.stringify(validSnapshot)], "readfrog.json", {
      type: "application/json",
    })

    const fileInput = screen.getByLabelText("snapshot-file-input")
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.preview"))).toBeInTheDocument()
    })

    const confirmBtn = screen.getByText(i18n.t("options.dictionary.confirmImport"))
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(commitImportMock).toHaveBeenCalledTimes(1)
    })
  })

  it("renders WebDAV section, allows configuration and testing connection", async () => {
    getWebdavConfigMock.mockResolvedValue({
      endpoint: "https://dav.example.com/webdav/",
      username: "myuser",
      password: "mypassword",
    })

    renderWithQuery(<DictionaryPage />)

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.webdav.title"))).toBeInTheDocument()
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

    renderWithQuery(<DictionaryPage />)

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

    renderWithQuery(<DictionaryPage />)

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
})
