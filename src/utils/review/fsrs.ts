import type { ReviewCardState, ReviewRating, ReviewState } from "./types"

const DEFAULT_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.691, 7.1949, 0.5345, 1.4604, 0.0046, 1.5457, 0.1192, 1.0192, 1.9395,
  0.11, 0.29605, 0.22695, 0.5698, 2.8544,
] as const

const ONE_MINUTE_MS = 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function createInitialReviewState(recordId: string, now: number = Date.now()): ReviewState {
  return {
    recordId,
    state: "new",
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
  }
}

function clampDifficulty(d: number): number {
  return Math.min(Math.max(d, 1), 10)
}

function calculateRetrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0
  return Math.pow(1 + elapsedDays / (9 * stability), -1)
}

export function calculateNextReviewState(
  current: ReviewState,
  rating: ReviewRating,
  now: number = Date.now(),
): ReviewState {
  const isInitial = current.state === "new" || current.lastReview === null

  if (isInitial) {
    // Initial ratings: 1: Again, 2: Hard, 3: Good, 4: Easy
    const stability: number = DEFAULT_WEIGHTS[rating - 1] ?? 1.0
    const difficulty = clampDifficulty(
      DEFAULT_WEIGHTS[4] - Math.exp(DEFAULT_WEIGHTS[5] * (rating - 1)) + 1,
    )

    let nextState: ReviewCardState
    let due: number
    let scheduledDays: number

    if (rating === 1) {
      nextState = "learning"
      scheduledDays = 0
      due = now + 10 * ONE_MINUTE_MS // Due in 10 minutes
    } else if (rating === 2) {
      nextState = "review"
      scheduledDays = 1
      due = now + 1 * ONE_DAY_MS
    } else if (rating === 3) {
      nextState = "review"
      scheduledDays = Math.max(2, Math.round(stability))
      due = now + scheduledDays * ONE_DAY_MS
    } else {
      nextState = "review"
      scheduledDays = Math.max(4, Math.round(stability))
      due = now + scheduledDays * ONE_DAY_MS
    }

    return {
      ...current,
      state: nextState,
      stability,
      difficulty,
      elapsedDays: 0,
      scheduledDays,
      reps: current.reps + 1,
      lapses: rating === 1 ? 1 : 0,
      due,
      lastReview: now,
    }
  }

  // Established card review
  const elapsedDays = Math.max(0, (now - current.lastReview!) / ONE_DAY_MS)
  const retrievability = calculateRetrievability(elapsedDays, current.stability)

  // Update difficulty
  const deltaD = -DEFAULT_WEIGHTS[6] * (rating - 3)
  const nextD = clampDifficulty(
    DEFAULT_WEIGHTS[7] * (DEFAULT_WEIGHTS[4] - Math.exp(DEFAULT_WEIGHTS[5] * 2) + 1) +
      (1 - DEFAULT_WEIGHTS[7]) * (current.difficulty + deltaD),
  )

  let nextStability: number
  let nextState: ReviewCardState
  let scheduledDays: number
  let due: number
  const nextLapses = rating === 1 ? current.lapses + 1 : current.lapses

  if (rating === 1) {
    // Lapse (Forgot)
    nextState = "relearning"
    nextStability = Math.max(
      0.1,
      DEFAULT_WEIGHTS[11] *
        Math.pow(current.difficulty, -DEFAULT_WEIGHTS[12]) *
        (Math.pow(current.stability + 1, DEFAULT_WEIGHTS[13]) - 1) *
        Math.exp(DEFAULT_WEIGHTS[14] * (1 - retrievability)),
    )
    scheduledDays = 0
    due = now + 10 * ONE_MINUTE_MS
  } else {
    // Remembered (Hard, Good, Easy)
    nextState = "review"
    const hardPenalty = rating === 2 ? DEFAULT_WEIGHTS[15] : 1.0
    const easyBonus = rating === 4 ? DEFAULT_WEIGHTS[16] : 1.0

    nextStability = Math.max(
      current.stability + 0.1,
      current.stability *
        (1 +
          Math.exp(DEFAULT_WEIGHTS[8]) *
            (11 - current.difficulty) *
            Math.pow(current.stability, -DEFAULT_WEIGHTS[9]) *
            (Math.exp(DEFAULT_WEIGHTS[10] * (1 - retrievability)) - 1) *
            hardPenalty *
            easyBonus),
    )

    if (rating === 2) {
      scheduledDays = Math.max(1, Math.round(current.scheduledDays * 1.2))
    } else if (rating === 3) {
      scheduledDays = Math.max(current.scheduledDays + 1, Math.round(nextStability))
    } else {
      scheduledDays = Math.max(current.scheduledDays + 2, Math.round(nextStability * 1.3))
    }
    due = now + scheduledDays * ONE_DAY_MS
  }

  return {
    ...current,
    state: nextState,
    stability: nextStability,
    difficulty: nextD,
    elapsedDays,
    scheduledDays,
    reps: current.reps + 1,
    lapses: nextLapses,
    due,
    lastReview: now,
  }
}
