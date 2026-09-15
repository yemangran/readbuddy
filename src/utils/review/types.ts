export type ReviewRating = 1 | 2 | 3 | 4

export const REVIEW_RATINGS = {
  AGAIN: 1 as ReviewRating,
  HARD: 2 as ReviewRating,
  GOOD: 3 as ReviewRating,
  EASY: 4 as ReviewRating,
} as const

export type ReviewCardState = "new" | "learning" | "review" | "relearning"

export interface ReviewState {
  recordId: string
  state: ReviewCardState
  due: number // Timestamp in milliseconds
  stability: number // S in days
  difficulty: number // D between 1 and 10
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  lastReview: number | null // Timestamp in milliseconds
}

export interface ReviewCardItem {
  recordId: string
  term: string
  phonetic: string
  partOfSpeech: string
  definition: string
  sentence: string
  sentenceTranslation: string
  reviewState: ReviewState
}

export interface ReviewSessionSummary {
  totalReviewed: number
  ratingCounts: Record<ReviewRating, number>
  remainingDueCount: number
}
