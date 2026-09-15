import type { ReviewState } from "../types"
import type { WebdavConfig } from "@/utils/local-dictionary/types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createReviewStore, type ReviewStorageDriver } from "../store"
import {
  exportReviewsSnapshot,
  getWebdavReviewsFileUrl,
  parseAndValidateReviewsSnapshot,
  reconcileReviewStates,
  syncReviewsWithWebdav,
} from "../sync"

describe("WebDAV Review Synchronization (LWW & Companion File)", () => {
  const sampleConfig: WebdavConfig = {
    endpoint: "https://dav.example.com/webdav/",
    username: "user",
    password: "pass",
  }

  let inMemoryStates: Record<string, ReviewState>
  let mockDriver: ReviewStorageDriver
  let store: ReturnType<typeof createReviewStore>

  beforeEach(() => {
    inMemoryStates = {}
    mockDriver = {
      getStates: async () => ({ ...inMemoryStates }),
      saveStates: async (states) => {
        inMemoryStates = { ...states }
      },
    }
    store = createReviewStore(mockDriver)
  })

  describe("getWebdavReviewsFileUrl", () => {
    it("derives readfrog-reviews.json path alongside readfrog.json", () => {
      expect(getWebdavReviewsFileUrl("https://dav.example.com/webdav/")).toBe(
        "https://dav.example.com/webdav/readfrog-reviews.json",
      )
      expect(getWebdavReviewsFileUrl("https://dav.example.com/webdav/readfrog.json")).toBe(
        "https://dav.example.com/webdav/readfrog-reviews.json",
      )
      expect(getWebdavReviewsFileUrl("https://dav.example.com/webdav")).toBe(
        "https://dav.example.com/webdav/readfrog-reviews.json",
      )
      expect(getWebdavReviewsFileUrl("https://dav.jianguoyun.com/dav")).toBe(
        "https://dav.jianguoyun.com/dav/readfrog/readfrog-reviews.json",
      )
    })
  })

  describe("Snapshot Export & Validation", () => {
    it("exports valid JSON with readfrog-reviews format header", () => {
      const states: Record<string, ReviewState> = {
        "rec-1": {
          recordId: "rec-1",
          state: "learning",
          due: 1700000000000,
          stability: 2.5,
          difficulty: 5.0,
          elapsedDays: 1,
          scheduledDays: 2,
          reps: 2,
          lapses: 0,
          lastReview: 1699990000000,
        },
      }

      const exported = exportReviewsSnapshot(states)
      const parsed = parseAndValidateReviewsSnapshot(exported)

      expect(parsed.ok).toBe(true)
      if (!parsed.ok) throw new Error("Validation failed")
      expect(parsed.snapshot.format).toBe("readfrog-reviews")
      expect(parsed.snapshot.version).toBe(1)
      expect(parsed.snapshot.reviews["rec-1"]?.stability).toBe(2.5)
    })

    it("handles raw record map fallback gracefully", () => {
      const rawJson = JSON.stringify({
        "rec-fallback": {
          recordId: "rec-fallback",
          state: "review",
          due: 1700000000000,
          stability: 5,
          difficulty: 3,
          elapsedDays: 2,
          scheduledDays: 5,
          reps: 4,
          lapses: 0,
          lastReview: 1699990000000,
        },
      })

      const parsed = parseAndValidateReviewsSnapshot(rawJson)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) throw new Error("Validation failed")
      expect(parsed.snapshot.reviews["rec-fallback"]?.recordId).toBe("rec-fallback")
    })
  })

  describe("reconcileReviewStates (LWW)", () => {
    it("merges disjoint review states without conflict", () => {
      const local: Record<string, ReviewState> = {
        "rec-1": {
          recordId: "rec-1",
          state: "learning",
          due: 1000,
          stability: 1,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 1,
          reps: 1,
          lapses: 0,
          lastReview: 500,
        },
      }
      const remote: Record<string, ReviewState> = {
        "rec-2": {
          recordId: "rec-2",
          state: "review",
          due: 2000,
          stability: 3,
          difficulty: 4,
          elapsedDays: 1,
          scheduledDays: 3,
          reps: 2,
          lapses: 0,
          lastReview: 800,
        },
      }

      const { merged, localChanged, remoteNeedsUpdate } = reconcileReviewStates(local, remote)

      expect(Object.keys(merged)).toHaveLength(2)
      expect(merged["rec-1"]?.reps).toBe(1)
      expect(merged["rec-2"]?.reps).toBe(2)
      expect(localChanged).toBe(true)
      expect(remoteNeedsUpdate).toBe(true)
    })

    it("reconciles conflicting states using Last-Review-Wins timestamp", () => {
      const localOlder: ReviewState = {
        recordId: "rec-conflict",
        state: "learning",
        due: 1000,
        stability: 1,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 1,
        lapses: 0,
        lastReview: 500,
      }
      const remoteNewer: ReviewState = {
        recordId: "rec-conflict",
        state: "review",
        due: 5000,
        stability: 4,
        difficulty: 4,
        elapsedDays: 2,
        scheduledDays: 4,
        reps: 3,
        lapses: 0,
        lastReview: 900,
      }

      // Remote wins because lastReview 900 > 500
      const { merged: merged1, localChanged: lc1 } = reconcileReviewStates(
        { "rec-conflict": localOlder },
        { "rec-conflict": remoteNewer },
      )
      expect(merged1["rec-conflict"]?.reps).toBe(3)
      expect(merged1["rec-conflict"]?.due).toBe(5000)
      expect(lc1).toBe(true)

      // Local wins if local is newer
      const localNewer: ReviewState = {
        ...localOlder,
        lastReview: 1200,
        reps: 4,
      }
      const {
        merged: merged2,
        localChanged: lc2,
        remoteNeedsUpdate: rn2,
      } = reconcileReviewStates({ "rec-conflict": localNewer }, { "rec-conflict": remoteNewer })
      expect(merged2["rec-conflict"]?.reps).toBe(4)
      expect(lc2).toBe(false)
      expect(rn2).toBe(true)
    })

    it("filters out orphaned review states if validRecordIds are supplied", () => {
      const local: Record<string, ReviewState> = {
        "valid-rec": {
          recordId: "valid-rec",
          state: "learning",
          due: 1000,
          stability: 1,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 1,
          reps: 1,
          lapses: 0,
          lastReview: 500,
        },
        "purged-rec": {
          recordId: "purged-rec",
          state: "learning",
          due: 1000,
          stability: 1,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 1,
          reps: 1,
          lapses: 0,
          lastReview: 400,
        },
      }

      const { merged } = reconcileReviewStates(
        local,
        {},
        { validRecordIds: new Set(["valid-rec"]) },
      )

      expect(merged["valid-rec"]).toBeDefined()
      expect(merged["purged-rec"]).toBeUndefined()
    })
  })

  describe("syncReviewsWithWebdav Round-trip", () => {
    it("Scenario 1: First sync when remote 404 -> uploads local review states to readfrog-reviews.json", async () => {
      inMemoryStates = {
        "card-1": {
          recordId: "card-1",
          state: "learning",
          due: 2000,
          stability: 1.5,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 1,
          reps: 1,
          lapses: 0,
          lastReview: 1000,
        },
      }

      let putBody = ""
      let putHeaders: Record<string, string> = {}
      const mockFetch = vi.fn<typeof fetch>(async (url: any, opts?: any) => {
        if (url.endsWith("readfrog-reviews.json")) {
          if (opts?.method === "GET") {
            return new Response(null, { status: 404 })
          }
          if (opts?.method === "PUT") {
            putBody = opts.body
            putHeaders = opts.headers
            return new Response(null, {
              status: 201,
              headers: { ETag: '"review-etag-1"' },
            })
          }
        }
        throw new Error(`Unexpected url: ${url}`)
      })

      const res = await syncReviewsWithWebdav(sampleConfig, {}, mockFetch, store)

      expect(res.ok).toBe(true)
      expect(res.remoteUploaded).toBe(true)
      expect(res.etag).toBe('"review-etag-1"')
      expect(putHeaders["If-None-Match"]).toBe("*")
      expect(putBody).toContain("readfrog-reviews")
      expect(putBody).toContain("card-1")
    })

    it("Scenario 2: Remote reviews exist and local is empty -> downloads and updates local store without PUT", async () => {
      const remoteSnapshot = {
        format: "readfrog-reviews",
        version: 1,
        updatedAt: 5000,
        reviews: {
          "card-remote": {
            recordId: "card-remote",
            state: "review",
            due: 6000,
            stability: 3,
            difficulty: 4,
            elapsedDays: 1,
            scheduledDays: 3,
            reps: 2,
            lapses: 0,
            lastReview: 4000,
          },
        },
      }

      const mockFetch = vi.fn<typeof fetch>(async (url: any, opts?: any) => {
        if (url.endsWith("readfrog-reviews.json") && opts?.method === "GET") {
          return new Response(JSON.stringify(remoteSnapshot), {
            status: 200,
            headers: { ETag: '"etag-remote-2"' },
          })
        }
        throw new Error(`Unexpected request: ${opts?.method} ${url}`)
      })

      const res = await syncReviewsWithWebdav(sampleConfig, {}, mockFetch, store)

      expect(res.ok).toBe(true)
      expect(res.remoteUploaded).toBe(false)
      expect(res.localUpdated).toBe(true)
      expect(inMemoryStates["card-remote"]).toBeDefined()
      expect(inMemoryStates["card-remote"]?.reps).toBe(2)
    })

    it("Scenario 3: Both exist with conflicts -> reconciles via LWW and conditionally uploads merged states", async () => {
      inMemoryStates = {
        "card-both": {
          recordId: "card-both",
          state: "learning",
          due: 2000,
          stability: 1,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 1,
          reps: 1,
          lapses: 0,
          lastReview: 1000, // Older
        },
        "card-local-only": {
          recordId: "card-local-only",
          state: "new",
          due: 3000,
          stability: 0,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          lastReview: 1500,
        },
      }

      const remoteSnapshot = {
        format: "readfrog-reviews",
        version: 1,
        updatedAt: 5000,
        reviews: {
          "card-both": {
            recordId: "card-both",
            state: "review",
            due: 5000,
            stability: 3,
            difficulty: 4,
            elapsedDays: 2,
            scheduledDays: 3,
            reps: 3,
            lapses: 0,
            lastReview: 2000, // Newer -> wins
          },
        },
      }

      let putUploaded = false
      let putBody = ""
      const mockFetch = vi.fn<typeof fetch>(async (url: any, opts?: any) => {
        if (url.endsWith("readfrog-reviews.json")) {
          if (opts?.method === "GET") {
            return new Response(JSON.stringify(remoteSnapshot), {
              status: 200,
              headers: { ETag: '"etag-both-1"' },
            })
          }
          if (opts?.method === "PUT") {
            putUploaded = true
            putBody = opts.body
            return new Response(null, {
              status: 204,
              headers: { ETag: '"etag-both-2"' },
            })
          }
        }
        throw new Error(`Unexpected request: ${opts?.method} ${url}`)
      })

      const res = await syncReviewsWithWebdav(sampleConfig, {}, mockFetch, store)

      expect(res.ok).toBe(true)
      expect(res.remoteUploaded).toBe(true)
      expect(res.localUpdated).toBe(true)
      expect(putUploaded).toBe(true)
      expect(putBody).toContain("card-local-only")
      // Remote won for card-both
      expect(inMemoryStates["card-both"]?.reps).toBe(3)
      // Local only card retained
      expect(inMemoryStates["card-local-only"]).toBeDefined()
    })
  })
})
