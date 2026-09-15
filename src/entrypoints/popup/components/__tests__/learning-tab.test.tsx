import type { LocalDictionaryRecord } from "@/utils/local-dictionary/types"
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LearningTab } from "../learning-tab"

const mockRecords: LocalDictionaryRecord[] = [
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
    columns: [
      { id: "col-1", name: "单词", position: 0 },
      { id: "col-2", name: "词性", position: 1 },
      { id: "col-3", name: "释义", position: 2 },
    ],
    mappings: [],
    cells: {
      "col-1": "serendipity",
      "col-2": "n.",
      "col-3": "意外发现珍奇事物的本领",
    },
  },
]

describe("LearningTab", () => {
  it("renders idle state with due count and starts review on button click", async () => {
    render(<LearningTab records={mockRecords} dueCount={1} isLoading={false} />)

    expect(screen.getByText(/本地词典复习/i)).toBeInTheDocument()
    expect(screen.getAllByText("1").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /开始复习/i })).toBeInTheDocument()

    // Click "开始复习"
    fireEvent.click(screen.getByRole("button", { name: /开始复习/i }))

    // Card face should appear with the term
    expect(await screen.findByText("serendipity")).toBeInTheDocument()
    expect(screen.getByText("n.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /良好/i })).toBeInTheDocument()
  })

  it("handles complete review cycle and displays completion summary card", async () => {
    render(<LearningTab records={mockRecords} dueCount={1} isLoading={false} />)

    // Start review
    fireEvent.click(screen.getByRole("button", { name: /开始复习/i }))

    // Rate "良好" (3) to flip
    fireEvent.click(await screen.findByRole("button", { name: /良好/i }))
    expect(screen.getByText("意外发现珍奇事物的本领")).toBeInTheDocument()

    // Click Next
    fireEvent.click(screen.getByRole("button", { name: /下一个|继续/i }))

    // Completion summary card should be displayed
    await waitFor(() => {
      expect(screen.getByText(/本次复习已完成/i)).toBeInTheDocument()
    })
    expect(screen.getAllByText("1").length).toBeGreaterThan(0) // 1 card reviewed
    expect(screen.getByRole("button", { name: /再来一组/i })).toBeInTheDocument()
  })
})
