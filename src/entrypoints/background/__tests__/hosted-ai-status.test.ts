import { beforeEach, describe, expect, it, vi } from "vitest"

const handlers = new Map<string, () => Promise<unknown>>()

vi.mock("@/utils/message", () => ({
  onMessage: (key: string, handler: () => Promise<unknown>) => {
    handlers.set(key, handler)
  },
}))

const { setupHostedAiStatusHandler } = await import("../hosted-ai-status")

describe("background hosted AI status", () => {
  beforeEach(() => {
    handlers.clear()
    setupHostedAiStatusHandler()
  })

  it("returns null for getHostedAiStatus without making network calls", async () => {
    const handler = handlers.get("getHostedAiStatus")
    expect(handler).toBeDefined()
    await expect(handler!()).resolves.toBeNull()
  })
})
