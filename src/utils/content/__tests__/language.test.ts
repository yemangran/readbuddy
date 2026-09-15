import { franc } from "franc"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("franc", () => ({
  franc: vi.fn<(...args: any[]) => any>(),
}))

const { getLocalConfigMock, toastAddMock } = vi.hoisted(() => ({
  toastAddMock: vi.fn<(...args: any[]) => any>(),
  getLocalConfigMock: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("@/components/ui/base-ui/toast", () => ({
  toastManager: { add: (...args: unknown[]) => toastAddMock(...args) },
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: getLocalConfigMock,
}))

const { detectLanguageWithSource } = await import("../language")

const mockFranc = vi.mocked(franc)

describe("detectLanguageWithSource", () => {
  beforeEach(() => {
    mockFranc.mockReset()
  })

  it("returns franc result when it is a supported language code", async () => {
    mockFranc.mockReturnValue("eng")

    await expect(
      detectLanguageWithSource("This is enough text to detect language."),
    ).resolves.toEqual({
      code: "eng",
      source: "franc",
    })
  })

  it("falls back when franc returns an unsupported language code", async () => {
    mockFranc.mockReturnValue("vmw")

    await expect(
      detectLanguageWithSource("Eyi je oro ni ede Yoruba fun idanwo wiwa ede."),
    ).resolves.toEqual({
      code: "und",
      source: "fallback",
    })
  })

  describe("when LLM detection is enabled but no provider is configured", () => {
    beforeEach(() => {
      toastAddMock.mockReset()
      getLocalConfigMock.mockResolvedValue({
        languageDetection: { mode: "llm", providerId: "" },
        providersConfig: [],
      })
    })

    it("stays silent and resolves with franc", async () => {
      mockFranc.mockReturnValue("eng")

      await expect(
        detectLanguageWithSource("This is enough text to detect language.", { enableLLM: true }),
      ).resolves.toEqual({ code: "eng", source: "franc" })

      expect(toastAddMock).not.toHaveBeenCalled()
    })
  })
})
