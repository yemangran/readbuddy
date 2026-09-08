import type { LocalDictionaryRecord } from "@/utils/local-dictionary/types"
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "@/utils/i18n"
import { DictionaryPage } from "../index"

const listRecordsMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const updateCellsMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const deleteRecordMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
const watchSignalMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())

vi.mock("@/utils/local-dictionary/client", () => ({
  listDictionaryRecords: listRecordsMock,
  updateDictionaryCells: updateCellsMock,
  deleteDictionaryRecord: deleteRecordMock,
  watchDictionaryChangeSignal: watchSignalMock,
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

  it("renders records list with cells, action, and updated time", async () => {
    listRecordsMock.mockResolvedValue({
      ok: true,
      data: { records: mockRecords, total: 1, page: 1, pageSize: 15 },
      changeSequence: 1,
    })

    renderWithQuery(<DictionaryPage />)

    await waitFor(() => {
      expect(screen.getByText("frog")).toBeInTheDocument()
      expect(screen.getByText("an amphibian")).toBeInTheDocument()
      expect(screen.getByText("Dictionary")).toBeInTheDocument()
    })
  })

  it("opens edit dialog and submits updated cells", async () => {
    listRecordsMock.mockResolvedValue({
      ok: true,
      data: { records: mockRecords, total: 1, page: 1, pageSize: 15 },
      changeSequence: 1,
    })
    updateCellsMock.mockResolvedValue({
      ok: true,
      data: { ...mockRecords[0], cells: { "c-term": "froggy" } },
      changeSequence: 2,
    })

    renderWithQuery(<DictionaryPage />)

    await waitFor(() => {
      expect(screen.getByText("frog")).toBeInTheDocument()
    })

    // Click edit button
    const editBtn = screen.getByRole("button", { name: "edit-record" })
    fireEvent.click(editBtn)

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.editTitle"))).toBeInTheDocument()
    })

    // Find the input containing "frog" and change it
    const inputs = screen.getAllByRole("textbox")
    const termInput = inputs.find((input) => (input as HTMLInputElement).value === "frog")
    expect(termInput).toBeDefined()
    if (termInput) {
      fireEvent.change(termInput, { target: { value: "froggy" } })
    }

    const saveBtn = screen.getByRole("button", { name: i18n.t("options.dictionary.save") })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(updateCellsMock).toHaveBeenCalledTimes(1)
    })

    expect(updateCellsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "rec-1",
        expectedRevision: "rev-1",
        cells: expect.objectContaining({ "c-term": "froggy" }),
      }),
    )
  })

  it("opens delete dialog and deletes record", async () => {
    listRecordsMock.mockResolvedValue({
      ok: true,
      data: { records: mockRecords, total: 1, page: 1, pageSize: 15 },
      changeSequence: 1,
    })
    deleteRecordMock.mockResolvedValue({
      ok: true,
      data: { id: "rec-1", deleted: true },
      changeSequence: 2,
    })

    renderWithQuery(<DictionaryPage />)

    await waitFor(() => {
      expect(screen.getByText("frog")).toBeInTheDocument()
    })

    // Click delete button
    const deleteBtn = screen.getByRole("button", { name: "delete-record" })
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(screen.getByText(i18n.t("options.dictionary.deleteConfirmTitle"))).toBeInTheDocument()
    })

    const confirmDeleteBtn = screen.getByRole("button", {
      name: i18n.t("options.dictionary.delete"),
    })
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(deleteRecordMock).toHaveBeenCalledTimes(1)
    })

    expect(deleteRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "rec-1",
        expectedRevision: "rev-1",
      }),
    )
  })
})
