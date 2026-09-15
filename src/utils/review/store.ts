import type { ReviewCardItem, ReviewRating, ReviewState } from "./types"
import type { LocalDictionaryRecord } from "@/utils/local-dictionary/types"
import { storage } from "#imports"
import { calculateNextReviewState, createInitialReviewState } from "./fsrs"

export const REVIEW_STATES_STORAGE_KEY = "local:reviewStates"
export const DEFAULT_REVIEW_BATCH_LIMIT = 15

export interface ReviewStorageDriver {
  getStates: () => Promise<Record<string, ReviewState>>
  saveStates: (states: Record<string, ReviewState>) => Promise<void>
}

const defaultStorageDriver: ReviewStorageDriver = {
  getStates: async () => {
    try {
      const data = await storage.getItem<Record<string, ReviewState>>(REVIEW_STATES_STORAGE_KEY)
      return data ?? {}
    } catch {
      return {}
    }
  },
  saveStates: async (states: Record<string, ReviewState>) => {
    await storage.setItem(REVIEW_STATES_STORAGE_KEY, states)
  },
}

export function extractReviewCardItem(
  record: LocalDictionaryRecord,
  reviewState?: ReviewState,
): ReviewCardItem {
  let term = ""
  let phonetic = ""
  let partOfSpeech = ""
  let definition = ""
  let sentence = ""
  let sentenceTranslation = ""

  for (const col of record.columns) {
    const rawVal = record.cells[col.id]
    if (rawVal === null || rawVal === undefined || rawVal === "") continue
    const valStr = String(rawVal).trim()
    const keyLower = (col.name || col.id).toLowerCase()

    if (
      keyLower.includes("term") ||
      keyLower.includes("词条") ||
      keyLower.includes("word") ||
      keyLower.includes("单词")
    ) {
      if (!term) term = valStr
    } else if (keyLower.includes("phonetic") || keyLower.includes("音标")) {
      if (!phonetic) phonetic = valStr
    } else if (
      keyLower.includes("partofspeech") ||
      keyLower.includes("pos") ||
      keyLower.includes("词性")
    ) {
      if (!partOfSpeech) partOfSpeech = valStr
    } else if (
      keyLower.includes("definition") ||
      keyLower.includes("释义") ||
      keyLower.includes("meaning") ||
      keyLower.includes("解释")
    ) {
      if (!definition) definition = valStr
    } else if (
      keyLower.includes("translation") ||
      keyLower.includes("例句翻译") ||
      keyLower.includes("翻译")
    ) {
      if (!sentenceTranslation) sentenceTranslation = valStr
    } else if (
      keyLower.includes("sentence") ||
      keyLower.includes("例句") ||
      keyLower.includes("context")
    ) {
      if (!sentence) sentence = valStr
    }
  }

  // Fallback term if not identified by column name
  const firstCol = record.columns[0]
  if (!term && firstCol) {
    const firstVal = record.cells[firstCol.id]
    if (firstVal) term = String(firstVal)
  }

  return {
    recordId: record.id,
    term: term || "Unknown",
    phonetic,
    partOfSpeech,
    definition,
    sentence,
    sentenceTranslation,
    reviewState: reviewState ?? createInitialReviewState(record.id),
  }
}

export interface ReviewStore {
  getState: (recordId: string) => Promise<ReviewState | null>
  getAllStates: () => Promise<Record<string, ReviewState>>
  submitRating: (
    recordId: string,
    rating: ReviewRating,
    options?: { now?: number },
  ) => Promise<ReviewState>
  buildReviewQueue: (
    records: LocalDictionaryRecord[],
    options?: { now?: number; batchLimit?: number },
  ) => Promise<ReviewCardItem[]>
  purgeReviewStates: (recordIds: string[]) => Promise<void>
  purgeOrphanedReviewStates: (validRecordIds: Iterable<string>) => Promise<number>
  saveAllStates: (states: Record<string, ReviewState>) => Promise<void>
  getDueCount: (records: LocalDictionaryRecord[], now?: number) => Promise<number>
}

export function createReviewStore(driver: ReviewStorageDriver = defaultStorageDriver): ReviewStore {
  async function getAllStates(): Promise<Record<string, ReviewState>> {
    return driver.getStates()
  }

  async function getState(recordId: string): Promise<ReviewState | null> {
    const states = await driver.getStates()
    return states[recordId] ?? null
  }

  async function submitRating(
    recordId: string,
    rating: ReviewRating,
    options?: { now?: number },
  ): Promise<ReviewState> {
    const now = options?.now ?? Date.now()
    const states = await driver.getStates()
    const current = states[recordId] ?? createInitialReviewState(recordId, now)
    const next = calculateNextReviewState(current, rating, now)

    states[recordId] = next
    await driver.saveStates(states)
    return next
  }

  async function buildReviewQueue(
    records: LocalDictionaryRecord[],
    options?: { now?: number; batchLimit?: number },
  ): Promise<ReviewCardItem[]> {
    const now = options?.now ?? Date.now()
    const batchLimit = options?.batchLimit ?? DEFAULT_REVIEW_BATCH_LIMIT
    const states = await driver.getStates()

    // Filter out soft-deleted records
    const activeRecords = records.filter((r) => !r.deletedAt)

    const dueCards: ReviewCardItem[] = []
    const newCards: ReviewCardItem[] = []

    for (const record of activeRecords) {
      const state = states[record.id]
      const card = extractReviewCardItem(record, state)

      if (state && state.state !== "new") {
        if (state.due <= now) {
          dueCards.push(card)
        }
      } else {
        newCards.push(card)
      }
    }

    // Sort due cards by due time ascending (oldest due first)
    dueCards.sort((a, b) => a.reviewState.due - b.reviewState.due)

    // Take due cards first
    const selectedDue = dueCards.slice(0, batchLimit)
    const remainingSlots = Math.max(0, batchLimit - selectedDue.length)
    const selectedNew = newCards.slice(0, remainingSlots)

    return [...selectedDue, ...selectedNew]
  }

  async function purgeReviewStates(recordIds: string[]): Promise<void> {
    if (!recordIds || recordIds.length === 0) return
    const states = await driver.getStates()
    let changed = false

    for (const id of recordIds) {
      if (states[id]) {
        delete states[id]
        changed = true
      }
    }

    if (changed) {
      await driver.saveStates(states)
    }
  }

  async function getDueCount(
    records: LocalDictionaryRecord[],
    now: number = Date.now(),
  ): Promise<number> {
    const states = await driver.getStates()
    const activeRecords = records.filter((r) => !r.deletedAt)
    let count = 0

    for (const record of activeRecords) {
      const state = states[record.id]
      if (state && state.state !== "new") {
        if (state.due <= now) {
          count++
        }
      } else {
        // New cards also count as pending to study
        count++
      }
    }

    return count
  }

  async function saveAllStates(states: Record<string, ReviewState>): Promise<void> {
    await driver.saveStates(states)
  }

  async function purgeOrphanedReviewStates(validRecordIds: Iterable<string>): Promise<number> {
    const validSet = new Set(validRecordIds)
    const states = await driver.getStates()
    let changed = false
    let count = 0

    for (const id of Object.keys(states)) {
      if (!validSet.has(id)) {
        delete states[id]
        changed = true
        count++
      }
    }

    if (changed) {
      await driver.saveStates(states)
    }
    return count
  }

  return {
    getState,
    getAllStates,
    submitRating,
    buildReviewQueue,
    purgeReviewStates,
    purgeOrphanedReviewStates,
    saveAllStates,
    getDueCount,
  }
}

export const reviewStore = createReviewStore()
