import { describe, expect, it, vi } from "vitest"
import { SILICONFLOW_SPONSORED_CLIENT_NAME } from "@/utils/constants/providers"
import {
  buildSponsorClientHeaders,
  createSiliconFlowSponsorFetch,
  extractContentFromMessages,
  generateSponsorSignature,
  resolveSiliconFlowAuthMode,
} from "../siliconflow-signing"

describe("siliconflow-signing", () => {
  describe("resolveSiliconFlowAuthMode", () => {
    it("preserves explicit sponsored authMode even when apiKey exists", () => {
      expect(
        resolveSiliconFlowAuthMode({
          apiKey: "sk-user-key",
          providerSpecificSettings: { authMode: "sponsored" },
        }),
      ).toBe("sponsored")
    })

    it("preserves explicit byok authMode even when apiKey is empty", () => {
      expect(
        resolveSiliconFlowAuthMode({
          apiKey: "",
          providerSpecificSettings: { authMode: "byok" },
        }),
      ).toBe("byok")
    })

    it("resolves to byok when apiKey is present and authMode is unconfigured", () => {
      expect(
        resolveSiliconFlowAuthMode({
          apiKey: "sk-existing-key",
        }),
      ).toBe("byok")

      expect(
        resolveSiliconFlowAuthMode({
          apiKey: "  sk-key-with-padding  ",
          providerSpecificSettings: {},
        }),
      ).toBe("byok")
    })

    it("resolves to sponsored for fresh installs and empty/missing apiKey", () => {
      expect(resolveSiliconFlowAuthMode({})).toBe("sponsored")
      expect(resolveSiliconFlowAuthMode({ apiKey: "" })).toBe("sponsored")
      expect(resolveSiliconFlowAuthMode({ apiKey: "   " })).toBe("sponsored")
      expect(
        resolveSiliconFlowAuthMode({
          providerSpecificSettings: {},
        }),
      ).toBe("sponsored")
    })
  })

  describe("extractContentFromMessages", () => {
    it("extracts text from string contents and multipart text parts", () => {
      const messages = [
        { role: "system", content: "You are a translator." },
        {
          role: "user",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
      ]
      expect(extractContentFromMessages(messages)).toBe("You are a translator.\nHello world")
    })

    it("handles non-array or invalid messages gracefully", () => {
      expect(extractContentFromMessages(null)).toBe("")
      expect(extractContentFromMessages(undefined)).toBe("")
      expect(extractContentFromMessages("invalid")).toBe("")
      expect(extractContentFromMessages([null, { role: "user" }])).toBe("\n")
    })
  })

  describe("generateSponsorSignature and buildSponsorClientHeaders", () => {
    it("generates deterministic SHA-256 signature matching web crypto", async () => {
      const timestamp = 1770000000000
      const sampleText = "Translate this text"
      const salt = "read_buddy_2026_sponsor_salt"

      const sig = await generateSponsorSignature(timestamp, sampleText, salt)
      expect(sig).toMatch(/^[a-f0-9]{64}$/)

      // Verify identical call yields identical hash
      const sig2 = await generateSponsorSignature(timestamp, sampleText, salt)
      expect(sig).toBe(sig2)
    })

    it("builds valid sponsor client headers", async () => {
      const timestamp = 1770000000000
      const headers = await buildSponsorClientHeaders("Sample translation prompt", timestamp)

      expect(headers["X-Plugin-Client"]).toBe(SILICONFLOW_SPONSORED_CLIENT_NAME)
      expect(headers["X-Timestamp"]).toBe(String(timestamp))
      expect(headers["X-Signature"]).toMatch(/^[a-f0-9]{64}$/)
    })

    it("truncates sample text to 100 characters for signature calculation", async () => {
      const longText = "A".repeat(200)
      const text100 = "A".repeat(100)
      const timestamp = 1770000000000

      const headersLong = await buildSponsorClientHeaders(longText, timestamp)
      const headers100 = await buildSponsorClientHeaders(text100, timestamp)

      expect(headersLong["X-Signature"]).toBe(headers100["X-Signature"])
    })
  })

  describe("createSiliconFlowSponsorFetch", () => {
    it("intercepts request, adds signed headers, and strips Authorization", async () => {
      const mockFetch = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ ok: true })))
      const sponsorFetch = createSiliconFlowSponsorFetch(mockFetch)

      const payload = {
        model: "tencent/Hunyuan-MT-7B",
        messages: [{ role: "user", content: "Hello world" }],
      }

      await sponsorFetch("https://siliconflow-gateway.read-buddy.workers.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer accidental-key",
          "X-Custom-Trace": "trace-123",
        },
        body: JSON.stringify(payload),
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe("https://siliconflow-gateway.read-buddy.workers.dev/v1/chat/completions")

      const headers = init.headers as Headers
      expect(headers.get("X-Plugin-Client")).toBe("read-buddy")
      expect(headers.get("X-Timestamp")).toBeTruthy()
      expect(headers.get("X-Signature")).toMatch(/^[a-f0-9]{64}$/)
      expect(headers.get("Authorization")).toBeNull()
      expect(headers.get("X-Custom-Trace")).toBe("trace-123")
      expect(headers.get("Content-Type")).toBe("application/json")
    })

    it("handles non-JSON request bodies gracefully", async () => {
      const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"))
      const sponsorFetch = createSiliconFlowSponsorFetch(mockFetch)

      await sponsorFetch("https://example.com", {
        method: "GET",
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const headers = init.headers as Headers
      expect(headers.get("X-Plugin-Client")).toBe("read-buddy")
      expect(headers.get("X-Signature")).toBeTruthy()
    })
  })
})
