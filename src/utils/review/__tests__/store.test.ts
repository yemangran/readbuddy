import type { ReviewState } from "../types"
import type { LocalDictionaryRecord } from "@/utils/local-dictionary/types"
import { describe, expect, it } from "vitest"
import { createReviewStore, extractReviewCardItem } from "../store"

function createMockRecord(
  id: string,
  overrides: Partial<LocalDictionaryRecord> = {},
): LocalDictionaryRecord {
  return {
    id,
    createdAt: 1000,
    updatedAt: 1000,
    deviceId: "device-1",
    deletedAt: null,
    localRevision: "rev-1",
    actionId: "act-1",
    actionName: "Dictionary",
    outputSchema: [],
    result: {},
    columns: [
      { id: "col-term", name: "单词", position: 0 },
      { id: "col-pos", name: "词性", position: 1 },
      { id: "col-def", name: "释义", position: 2 },
      { id: "col-phonetic", name: "音标", position: 3 },
      { id: "col-sentence", name: "例句", position: 4 },
      { id: "col-sentence-trans", name: "例句翻译", position: 5 },
    ],
    mappings: [],
    cells: {
      "col-term": `word-${id}`,
      "col-pos": "n.",
      "col-def": `definition for ${id}`,
      "col-phonetic": `/wɜːd/`,
      "col-sentence": `This is a sentence with word-${id}.`,
      "col-sentence-trans": `这是一个包含 word-${id} 的例句。`,
    },
    ...overrides,
  }
}

describe("Review Store and Queue Builder", () => {
  const NOW = 1700000000000

  it("extracts clean card fields from a dictionary record", () => {
    const record = createMockRecord("rec-1")
    const card = extractReviewCardItem(record)

    expect(card.recordId).toBe("rec-1")
    expect(card.term).toBe("word-rec-1")
    expect(card.partOfSpeech).toBe("n.")
    expect(card.definition).toBe("definition for rec-1")
    expect(card.phonetic).toBe("/wɜːd/")
    expect(card.sentence).toBe("This is a sentence with word-rec-1.")
    expect(card.sentenceTranslation).toBe("这是一个包含 word-rec-1 的例句。")
  })

  it("builds queue prioritizing due cards and supplementing with new cards up to batch limit", async () => {
    const memoryStorage = new Map<string, ReviewState>()
    const store = createReviewStore({
      getStates: async () => Object.fromEntries(memoryStorage.entries()),
      saveStates: async (states) => {
        memoryStorage.clear()
        for (const [k, v] of Object.entries(states)) {
          memoryStorage.set(k, v)
        }
      },
    })

    // Setup 1 overdue card, 1 future card, and 3 new cards
    memoryStorage.set("rec-due", {
      recordId: "rec-due",
      state: "review",
      due: NOW - 3600000, // 1 hour ago
      stability: 3,
      difficulty: 5,
      elapsedDays: 3,
      scheduledDays: 3,
      reps: 2,
      lapses: 0,
      lastReview: NOW - 3 * 86400000,
    })

    memoryStorage.set("rec-future", {
      recordId: "rec-future",
      state: "review",
      due: NOW + 86400000, // Tomorrow
      stability: 5,
      difficulty: 5,
      elapsedDays: 1,
      scheduledDays: 5,
      reps: 3,
      lapses: 0,
      lastReview: NOW,
    })

    const records: LocalDictionaryRecord[] = [
      createMockRecord("rec-new-1"),
      createMockRecord("rec-future"),
      createMockRecord("rec-due"),
      createMockRecord("rec-new-2"),
      createMockRecord("rec-deleted", { deletedAt: NOW - 100 }),
    ]

    const queue = await store.buildReviewQueue(records, { now: NOW, batchLimit: 2 })

    // Should prioritize due card first, then 1 new card (since batchLimit = 2)
    expect(queue).toHaveLength(2)
    expect(queue[0]?.recordId).toBe("rec-due")
    expect(queue[1]?.recordId).toBe("rec-new-1")

    // Deleted records should never be in the queue
    expect(queue.some((c) => c.recordId === "rec-deleted")).toBe(false)
    // Future cards should not be in the due review list
    expect(queue.some((c) => c.recordId === "rec-future")).toBe(false)
  })

  it("updates review state and saves when rating is submitted", async () => {
    const memoryStorage = new Map<string, ReviewState>()
    const store = createReviewStore({
      getStates: async () => Object.fromEntries(memoryStorage.entries()),
      saveStates: async (states) => {
        memoryStorage.clear()
        for (const [k, v] of Object.entries(states)) {
          memoryStorage.set(k, v)
        }
      },
    })

    const record = createMockRecord("rec-learn")
    const card = extractReviewCardItem(record)

    const updated = await store.submitRating(card.recordId, 3, { now: NOW })

    expect(updated.state).toBe("review")
    expect(updated.reps).toBe(1)
    expect(updated.lastReview).toBe(NOW)

    const persisted = await store.getState(card.recordId)
    expect(persisted).toEqual(updated)
  })

  it("cascades purge of deleted record IDs to clean up orphaned review states", async () => {
    const memoryStorage = new Map<string, ReviewState>()
    memoryStorage.set("rec-1", {
      recordId: "rec-1",
      state: "review",
      due: NOW,
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 1,
      lapses: 0,
      lastReview: NOW,
    })
    memoryStorage.set("rec-2", {
      recordId: "rec-2",
      state: "review",
      due: NOW,
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 1,
      lapses: 0,
      lastReview: NOW,
    })

    const store = createReviewStore({
      getStates: async () => Object.fromEntries(memoryStorage.entries()),
      saveStates: async (states) => {
        memoryStorage.clear()
        for (const [k, v] of Object.entries(states)) {
          memoryStorage.set(k, v)
        }
      },
    })

    await store.purgeReviewStates(["rec-1"])

    expect(await store.getState("rec-1")).toBeNull()
    expect(await store.getState("rec-2")).not.toBeNull()
  })
})
