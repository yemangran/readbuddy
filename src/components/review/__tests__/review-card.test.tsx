import type { ReviewCardItem, ReviewRating } from "@/utils/review/types"
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReviewCard } from "../review-card"

const mockCard: ReviewCardItem = {
  recordId: "rec-test-1",
  term: "ephemeral",
  phonetic: "/ɪˈfem.ər.əl/",
  partOfSpeech: "adj.",
  definition: "短暂的，转瞬即逝的",
  sentence: "Fame in the world of pop music is largely ephemeral.",
  sentenceTranslation: "在流行音乐界，名声大抵是转瞬即逝的。",
  reviewState: {
    recordId: "rec-test-1",
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
}

describe("ReviewCard Component", () => {
  it("renders prompt face initially with term, part of speech, and 4 rating buttons", () => {
    const handleNext = vi.fn<(rating: ReviewRating) => void>()
    render(<ReviewCard card={mockCard} onNext={handleNext} />)

    expect(screen.getByText("ephemeral")).toBeInTheDocument()
    expect(screen.getByText("adj.")).toBeInTheDocument()

    // 4 rating buttons
    expect(screen.getByRole("button", { name: /重来/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /困难/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /良好/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /简单/i })).toBeInTheDocument()

    // Definition and sentence should NOT be visible on the prompt face
    expect(screen.queryByText("短暂的，转瞬即逝的")).not.toBeInTheDocument()
    expect(screen.queryByText(/Fame in the world/i)).not.toBeInTheDocument()
  })

  it("flips to answer face when a rating button is clicked, showing definition and sentence", () => {
    const handleNext = vi.fn<(rating: ReviewRating) => void>()
    render(<ReviewCard card={mockCard} onNext={handleNext} />)

    // Click "良好" rating button
    fireEvent.click(screen.getByRole("button", { name: /良好/i }))

    // Now answer face is revealed
    expect(screen.getByText("短暂的，转瞬即逝的")).toBeInTheDocument()
    expect(screen.getByText("/ɪˈfem.ər.əl/")).toBeInTheDocument()
    expect(screen.getByText(/Fame in the world/i)).toBeInTheDocument()
    expect(screen.getByText(/在流行音乐界/i)).toBeInTheDocument()

    // Next button appears
    expect(screen.getByRole("button", { name: /下一个|继续/i })).toBeInTheDocument()
  })

  it("permits re-selecting rating on the back face and commits with the final rating on Next", () => {
    const handleNext = vi.fn<(rating: ReviewRating) => void>()
    render(<ReviewCard card={mockCard} onNext={handleNext} />)

    // Click "良好" (3) first
    fireEvent.click(screen.getByRole("button", { name: /良好/i }))

    // User realizes they misremembered, changes to "困难" (2)
    fireEvent.click(screen.getByRole("button", { name: /困难/i }))

    // Click Next
    fireEvent.click(screen.getByRole("button", { name: /下一个|继续/i }))

    expect(handleNext).toHaveBeenCalledTimes(1)
    expect(handleNext).toHaveBeenCalledWith(2)
  })

  it("advances with Enter or Space key press when on answer face", () => {
    const handleNext = vi.fn<(rating: ReviewRating) => void>()
    render(<ReviewCard card={mockCard} onNext={handleNext} />)

    // Flip card by rating "简单" (4)
    fireEvent.click(screen.getByRole("button", { name: /简单/i }))

    // Press Enter
    fireEvent.keyDown(window, { key: "Enter" })

    expect(handleNext).toHaveBeenCalledTimes(1)
    expect(handleNext).toHaveBeenCalledWith(4)
  })
})
