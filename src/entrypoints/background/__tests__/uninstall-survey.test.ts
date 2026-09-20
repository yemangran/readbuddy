import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { setupUninstallSurvey } from "../uninstall-survey"

/**
 * Seam test for the uninstall-survey registration.
 *
 * Uninstalling must stay private: whatever the resolved locale yields, the URL handed to
 * `browser.runtime.setUninstallURL` is the canonical open-source issue tracker with every
 * query parameter stripped — in particular no version / browser type / browser version /
 * OS / UI language fingerprint is ever appended. Any other value (blank, malformed, a
 * non-canonical host) registers no page at all, so uninstall stays silent.
 */
const setUninstallURLMock = vi.fn<(url: string) => void>()

const { mockState } = vi.hoisted(() => ({
  mockState: {
    localizedUrl: "https://github.com/yemangran/readbuddy/issues",
  },
}))

vi.mock("#imports", () => ({
  browser: {
    runtime: {
      setUninstallURL: (url: string) => setUninstallURLMock(url),
    },
  },
}))

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => {
      if (key === "uninstallSurveyUrl") return mockState.localizedUrl
      return key
    },
  },
}))

describe("setupUninstallSurvey", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(browser.runtime as any).setUninstallURL = setUninstallURLMock
    mockState.localizedUrl = "https://github.com/yemangran/readbuddy/issues"
  })

  it("registers the canonical issue tracker URL verbatim", async () => {
    await setupUninstallSurvey()

    expect(setUninstallURLMock).toHaveBeenCalledTimes(1)
    expect(setUninstallURLMock).toHaveBeenCalledWith(
      "https://github.com/yemangran/readbuddy/issues",
    )
  })

  it("never appends environment metadata, whatever the resolved locale yields", async () => {
    // Every locale points at the tracker; simulate the value shifting with the UI language
    // and require the registered URL to stay parameterless in all of them.
    const localizedUrls = [
      "https://github.com/yemangran/readbuddy/issues",
      "https://github.com/yemangran/readbuddy/issues?ref=uninstall",
      "https://github.com/yemangran/readbuddy/issues?browser_type=edge&os=Windows&ui_lang=zh-CN",
    ]

    for (const localizedUrl of localizedUrls) {
      mockState.localizedUrl = localizedUrl
      await setupUninstallSurvey()

      expect(new URL(setUninstallURLMock.mock.calls.at(-1)![0]).search).toBe("")
    }
  })

  it("registers no uninstall page for a non-canonical target", async () => {
    const nonCanonicalUrls = [
      "https://survey.example.com/feedback",
      "https://github.com/someone-else/readbuddy/issues",
      "https://readfrog.app/uninstall",
    ]

    for (const nonCanonicalUrl of nonCanonicalUrls) {
      mockState.localizedUrl = nonCanonicalUrl
      await setupUninstallSurvey()

      // An empty uninstall URL clears the registration, so the browser opens no page.
      expect(setUninstallURLMock).toHaveBeenLastCalledWith("")
    }
  })

  it("uninstalls silently when the localized value is blank", async () => {
    mockState.localizedUrl = ""
    await setupUninstallSurvey()

    expect(setUninstallURLMock).toHaveBeenCalledWith("")
  })

  it("uninstalls silently when the localized value is not a URL", async () => {
    mockState.localizedUrl = "not a url"
    await setupUninstallSurvey()

    expect(setUninstallURLMock).toHaveBeenCalledWith("")
  })
})
