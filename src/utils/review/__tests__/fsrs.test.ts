import type { ReviewState } from "../types"
import { describe, expect, it } from "vitest"
import { calculateNextReviewState, createInitialReviewState } from "../fsrs"

describe("FSRS Scheduler", () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000
  const BASE_TIME = 1700000000000 // Fixed epoch for testing

  it("creates an initial unreviewed state for a new record", () => {
    const state = createInitialReviewState("rec-1", BASE_TIME)
    expect(state.recordId).toBe("rec-1")
    expect(state.state).toBe("new")
    expect(state.reps).toBe(0)
    expect(state.lapses).toBe(0)
    expect(state.lastReview).toBeNull()
    expect(state.due).toBe(BASE_TIME)
  })

  it("schedules newly rated cards with strictly increasing intervals for higher ratings", () => {
    const initialState = createInitialReviewState("rec-1", BASE_TIME)

    const nextAgain = calculateNextReviewState(initialState, 1, BASE_TIME)
    const nextHard = calculateNextReviewState(initialState, 2, BASE_TIME)
    const nextGood = calculateNextReviewState(initialState, 3, BASE_TIME)
    const nextEasy = calculateNextReviewState(initialState, 4, BASE_TIME)

    expect(nextAgain.state).toBe("learning")
    expect(nextGood.state).toBe("review")
    expect(nextEasy.state).toBe("review")

    // Intervals should be strictly ordered: Again < Hard < Good < Easy
    expect(nextAgain.due).toBeLessThan(nextHard.due)
    expect(nextHard.due).toBeLessThan(nextGood.due)
    expect(nextGood.due).toBeLessThan(nextEasy.due)

    // Repetitions should increase
    expect(nextGood.reps).toBe(1)
    expect(nextGood.lastReview).toBe(BASE_TIME)
  })

  it("resets stability and increments lapses when an established review card is graded Again", () => {
    // Create an already established card with high stability
    const establishedCard: ReviewState = {
      recordId: "rec-established",
      state: "review",
      due: BASE_TIME,
      stability: 15.0,
      difficulty: 4.5,
      elapsedDays: 15,
      scheduledDays: 15,
      reps: 5,
      lapses: 0,
      lastReview: BASE_TIME - 15 * ONE_DAY_MS,
    }

    const nextState = calculateNextReviewState(establishedCard, 1, BASE_TIME)

    expect(nextState.state).toBe("relearning")
    expect(nextState.lapses).toBe(1)
    expect(nextState.reps).toBe(6)
    // Stability should significantly drop after lapse
    expect(nextState.stability).toBeLessThan(establishedCard.stability)
    // Next due date should be very soon (short relearning interval)
    expect(nextState.due).toBeLessThan(BASE_TIME + ONE_DAY_MS)
  })

  it("increases stability and schedules further into the future on consecutive Good ratings", () => {
    const initial = createInitialReviewState("rec-progression", BASE_TIME)

    const step1 = calculateNextReviewState(initial, 3, BASE_TIME)
    const step1Time = step1.due
    const step2 = calculateNextReviewState(step1, 3, step1Time)

    expect(step2.reps).toBe(2)
    expect(step2.stability).toBeGreaterThan(step1.stability)
    expect(step2.scheduledDays).toBeGreaterThan(step1.scheduledDays)
    expect(step2.due).toBeGreaterThan(step1.due)
  })
})
