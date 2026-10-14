import { describe, expect, it } from "vitest"
import { extractAISDKErrorMessage, extractErrorMessage } from "../extract-message"

describe("extract-message", () => {
  describe("extractErrorMessage", () => {
    it("extracts error message from Response JSON error.message", async () => {
      const response = new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), {
        status: 429,
        statusText: "Too Many Requests",
      })
      expect(await extractErrorMessage(response)).toBe("Quota exceeded")
    })

    it("extracts error message from Response JSON message", async () => {
      const response = new Response(JSON.stringify({ message: "Bad Request" }), {
        status: 400,
        statusText: "Bad Request",
      })
      expect(await extractErrorMessage(response)).toBe("Bad Request")
    })

    it("falls back to status and statusText when text is empty", async () => {
      const response = new Response("", { status: 500, statusText: "Internal Server Error" })
      expect(await extractErrorMessage(response)).toBe("500 Internal Server Error")
    })
  })

  describe("extractAISDKErrorMessage", () => {
    it("strips SDK retry prefix and AI_APICallError prefix", () => {
      const error = new Error(
        "Failed after 3 attempts. Last error: AI_APICallError: 免 Key 赞助通道并发已满，请稍后再试或切换为自有 API Key 模式。",
      )
      expect(extractAISDKErrorMessage(error)).toBe(
        "免 Key 赞助通道并发已满，请稍后再试或切换为自有 API Key 模式。",
      )
    })

    it("strips standalone APICallError prefix", () => {
      const error = new Error("APICallError: Custom provider failed")
      expect(extractAISDKErrorMessage(error)).toBe("Custom provider failed")
    })

    it("preserves responseBody verbatim when message is generic", () => {
      const responseBody = JSON.stringify({
        error: {
          message: "免 Key 赞助通道验证失败，请检查网络、重试或切换为自有 API Key 模式。",
        },
      })
      const error = {
        message: "something went wrong",
        responseBody,
      }
      expect(extractAISDKErrorMessage(error)).toBe(responseBody)
    })

    it("extracts nested JSON message from message property", () => {
      const error = {
        message:
          'Failed after 3 attempts. Last error: AI_APICallError: {"error":{"message":"免 Key 赞助通道并发已满，请稍后再试或切换为自有 API Key 模式。"}}',
      }
      expect(extractAISDKErrorMessage(error)).toBe(
        "免 Key 赞助通道并发已满，请稍后再试或切换为自有 API Key 模式。",
      )
    })

    it("handles plain strings and parses JSON if string contains JSON", () => {
      expect(extractAISDKErrorMessage("Simple error string")).toBe("Simple error string")
      expect(
        extractAISDKErrorMessage(JSON.stringify({ error: { message: "JSON error string" } })),
      ).toBe("JSON error string")
    })

    it("returns unexpected error occurred for null or non-object errors", () => {
      expect(extractAISDKErrorMessage(null)).toBe("Unexpected error occurred")
      expect(extractAISDKErrorMessage(undefined)).toBe("Unexpected error occurred")
      expect(extractAISDKErrorMessage(123)).toBe("Unexpected error occurred")
    })
  })
})
