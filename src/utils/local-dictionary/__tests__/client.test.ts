import { beforeEach, describe, expect, it, vi } from "vitest"
import { getDictionaryRecord, sendWithRetry } from "../client"

const sendMessageMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

describe("Local Dictionary Client - sendWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns immediately on success", async () => {
    const action = vi
      .fn<() => Promise<any>>()
      .mockResolvedValue({ ok: true, data: "done", changeSequence: 1 })
    const result = await sendWithRetry(action, 2, 5)

    expect(result).toEqual({ ok: true, data: "done", changeSequence: 1 })
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("retries retryable errors and returns on subsequent success", async () => {
    const action = vi
      .fn<() => Promise<any>>()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "STORAGE_UNAVAILABLE", retryable: true, message: "busy" },
      })
      .mockResolvedValueOnce({ ok: true, data: { createdIds: ["id-1"] }, changeSequence: 2 })

    const result = await sendWithRetry(action, 2, 5)

    expect(result).toEqual({ ok: true, data: { createdIds: ["id-1"] }, changeSequence: 2 })
    expect(action).toHaveBeenCalledTimes(2)
  })

  it("does not retry non-retryable errors", async () => {
    const action = vi.fn<() => Promise<any>>().mockResolvedValue({
      ok: false,
      error: { code: "EDIT_CONFLICT", retryable: false, message: "conflict" },
    })

    const result = await sendWithRetry(action, 2, 5)

    expect(result.ok).toBe(false)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("stops retrying once maxRetries is reached", async () => {
    const action = vi.fn<() => Promise<any>>().mockResolvedValue({
      ok: false,
      error: { code: "STORAGE_UNAVAILABLE", retryable: true, message: "still busy" },
    })

    const result = await sendWithRetry(action, 2, 5)

    expect(result.ok).toBe(false)
    expect(action).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  it("calls sendMessage through getDictionaryRecord and retries on transient error", async () => {
    sendMessageMock
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "BUSY", retryable: true, message: "lock error" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { id: "record-1" },
        changeSequence: 1,
      })

    const reply = await getDictionaryRecord("record-1")
    expect(reply.ok).toBe(true)
    expect(sendMessageMock).toHaveBeenCalledTimes(2)
    expect(sendMessageMock).toHaveBeenCalledWith("dictionaryGet", { id: "record-1" })
  })

  it("retries on transient message port disconnection error and succeeds when port recovers", async () => {
    const action = vi
      .fn<() => Promise<any>>()
      .mockRejectedValueOnce(new Error("The message port closed before a response was received."))
      .mockResolvedValueOnce({ ok: true, data: { id: "record-1" }, changeSequence: 1 })

    const result = await sendWithRetry(action, 2, 5)
    expect(result).toEqual({ ok: true, data: { id: "record-1" }, changeSequence: 1 })
    expect(action).toHaveBeenCalledTimes(2)
  })

  it("gracefully wraps unrecoverable port disconnection error into STORAGE_UNAVAILABLE without throwing", async () => {
    const action = vi
      .fn<() => Promise<any>>()
      .mockRejectedValue(new Error("The message port closed before a response was received."))

    const result = await sendWithRetry(action, 2, 5)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe("STORAGE_UNAVAILABLE")
    expect(result.error.message).toContain("message port closed")
    expect(action).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })
})
