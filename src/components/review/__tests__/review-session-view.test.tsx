import type { ReviewCardItem, ReviewRating } from "@/utils/review/types"
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReviewSessionView } from "../review-session-view"

const mockCards: ReviewCardItem[] = [
  {
    recordId: "rec-1",
    term: "apple",
    phonetic: "/ˈæp.əl/",
    partOfSpeech: "n.",
    definition: "苹果",
    sentence: "An apple a day keeps the doctor away.",
    sentenceTranslation: "一天一苹果，医生远离我。",
    reviewState: {
      recordId: "rec-1",
      state: "new",
      due: 1700000000000,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      lastReview: null,
    },
  },
  {
    recordId: "rec-2",
    term: "banana",
    phonetic: "/bəˈnɑː.nə/",
    partOfSpeech: "n.",
    definition: "香蕉",
    sentence: "Monkeys love bananas.",
    sentenceTranslation: "猴子喜欢香蕉。",
    reviewState: {
      recordId: "rec-2",
      state: "new",
      due: 1700000000000,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      lastReview: null,
    },
  },
]

describe("ReviewSessionView", () => {
  it("shows progress through multiple cards and completes session", async () => {
    const handleComplete =
      vi.fn<
        (summary: {
          totalReviewed: number
          ratingCounts: Record<number, number>
          remainingDueCount: number
        }) => void
      >()
    const handleRatingSubmit = vi
      .fn<(recordId: string, rating: ReviewRating) => Promise<unknown>>()
      .mockResolvedValue({})

    render(
      <ReviewSessionView
        cards={mockCards}
        onComplete={handleComplete}
        onSubmitRating={handleRatingSubmit}
      />,
    )

    // First card: apple (appears in queue sidebar and main card)
    expect(screen.getAllByText("apple").length).toBeGreaterThan(0)
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument()

    // Rate "良好" (3) and flip
    fireEvent.click(screen.getByRole("button", { name: /良好/i }))
    expect(screen.getByText("苹果")).toBeInTheDocument()

    // Click Next
    fireEvent.click(screen.getByRole("button", { name: /下一个|继续/i }))

    expect(handleRatingSubmit).toHaveBeenCalledWith("rec-1", 3)

    // Second card: banana
    expect((await screen.findAllByText("banana")).length).toBeGreaterThan(0)
    expect(screen.getByText(/2 \/ 2/)).toBeInTheDocument()

    // Rate "简单" (4) and flip
    fireEvent.click(screen.getByRole("button", { name: /简单/i }))
    expect(screen.getByText("香蕉")).toBeInTheDocument()

    // Click Next
    fireEvent.click(screen.getByRole("button", { name: /下一个|继续/i }))

    expect(handleRatingSubmit).toHaveBeenCalledWith("rec-2", 4)

    // Complete should be called with summary
    await vi.waitFor(() => {
      expect(handleComplete).toHaveBeenCalledTimes(1)
    })
    const summary = handleComplete.mock.calls[0]?.[0]
    expect(summary?.totalReviewed).toBe(2)
    expect(summary?.ratingCounts[3]).toBe(1)
    expect(summary?.ratingCounts[4]).toBe(1)
  })
})
