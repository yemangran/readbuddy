import type { LocalDictionaryRecord } from "@/utils/local-dictionary/types"
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reviewStore } from "@/utils/review/store"
import { ImmersiveStudyMode } from "../components/immersive-study-mode"

const mockRecords: LocalDictionaryRecord[] = [
  {
    id: "rec-study-1",
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
      { id: "c1", name: "单词", position: 0 },
      { id: "c2", name: "释义", position: 1 },
      { id: "c3", name: "词性", position: 2 },
    ],
    mappings: [],
    cells: {
      c1: "serendipity",
      c2: "意外发现珍奇事物的本领",
      c3: "n.",
    },
  },
  {
    id: "rec-study-2",
    createdAt: 2000,
    updatedAt: 2000,
    deviceId: "dev-1",
    deletedAt: null,
    localRevision: "rev-2",
    actionId: "act-1",
    actionName: "Dictionary",
    outputSchema: [],
    result: {},
    columns: [
      { id: "c1", name: "单词", position: 0 },
      { id: "c2", name: "释义", position: 1 },
      { id: "c3", name: "词性", position: 2 },
    ],
    mappings: [],
    cells: {
      c1: "ephemeral",
      c2: "短暂的",
      c3: "adj.",
    },
  },
]

describe("ImmersiveStudyMode Component", () => {
  const onExitMock = vi.fn<() => void>()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders empty state when there are no cards in queue and allows exiting", async () => {
    vi.spyOn(reviewStore, "buildReviewQueue").mockResolvedValue([])

    render(<ImmersiveStudyMode records={[]} onExit={onExitMock} />)

    await waitFor(() => {
      expect(screen.getByText(/暂无待复习单词/i)).toBeInTheDocument()
    })

    const backButtons = screen.getAllByRole("button", { name: /返回词典/i })
    fireEvent.click(backButtons[0]!)
    expect(onExitMock).toHaveBeenCalled()
  })

  it("loads review queue and renders full-page flashcard with keyboard hints", async () => {
    vi.spyOn(reviewStore, "buildReviewQueue").mockResolvedValue([
      {
        recordId: "rec-study-1",
        term: "serendipity",
        phonetic: "",
        partOfSpeech: "n.",
        definition: "意外发现珍奇事物的本领",
        sentence: "",
        sentenceTranslation: "",
        reviewState: {
          recordId: "rec-study-1",
          state: "new",
          due: Date.now(),
          stability: 0,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          lastReview: null,
        },
      },
    ])

    render(<ImmersiveStudyMode records={mockRecords} onExit={onExitMock} />)

    await waitFor(() => {
      expect(screen.getByText("serendipity")).toBeInTheDocument()
    })

    expect(screen.getByText("n.")).toBeInTheDocument()
    // Front card shows rating buttons with keyboard shortcut hints [1], [2], [3], [4]
    expect(screen.getByText("重来")).toBeInTheDocument()
    expect(screen.getByText("简单")).toBeInTheDocument()
    expect(screen.getByText("评估难度")).toBeInTheDocument()
    expect(screen.getByText("翻转与前进")).toBeInTheDocument()
  })

  it("supports keyboard navigation to rate card, flips to back, and completes session", async () => {
    const submitRatingSpy = vi.spyOn(reviewStore, "submitRating").mockResolvedValue({
      recordId: "rec-study-1",
      state: "learning",
      due: Date.now() + 10000,
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 1,
      lapses: 0,
      lastReview: Date.now(),
    })

    vi.spyOn(reviewStore, "buildReviewQueue").mockResolvedValue([
      {
        recordId: "rec-study-1",
        term: "serendipity",
        phonetic: "",
        partOfSpeech: "n.",
        definition: "意外发现珍奇事物的本领",
        sentence: "",
        sentenceTranslation: "",
        reviewState: {
          recordId: "rec-study-1",
          state: "new",
          due: Date.now(),
          stability: 0,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          lastReview: null,
        },
      },
    ])

    render(<ImmersiveStudyMode records={mockRecords} onExit={onExitMock} />)

    await waitFor(() => {
      expect(screen.getByText("serendipity")).toBeInTheDocument()
    })

    // Press '3' for Good rating
    fireEvent.keyDown(window, { key: "3" })

    // Should reveal definition on card back
    await waitFor(() => {
      expect(screen.getByText("意外发现珍奇事物的本领")).toBeInTheDocument()
    })

    // Press Enter to complete and advance
    fireEvent.keyDown(window, { key: "Enter" })

    await waitFor(() => {
      expect(submitRatingSpy).toHaveBeenCalledWith("rec-study-1", 3)
      // Session summary card should appear
      expect(screen.getByText(/本次复习已完成/i)).toBeInTheDocument()
    })

    // Click "查看词典详情" in summary
    const exitSummaryBtn = screen.getByRole("button", { name: /查看词典详情/i })
    fireEvent.click(exitSummaryBtn)
    expect(onExitMock).toHaveBeenCalled()
  })
})
