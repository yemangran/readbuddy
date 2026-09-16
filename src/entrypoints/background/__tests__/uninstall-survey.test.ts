import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { setupUninstallSurvey } from "../uninstall-survey"

const setUninstallURLMock = vi.fn<(url: string) => void>()

const { mockState } = vi.hoisted(() => ({
  mockState: {
    surveyUrl: "https://github.com/yemangran/readbuddy/issues",
  },
}))

vi.mock("#imports", () => ({
  browser: {
    runtime: {
      setUninstallURL: (url: string) => setUninstallURLMock(url),
    },
    i18n: {
      getUILanguage: () => "en-US",
    },
  },
}))

vi.mock("@/utils/constants/app", async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    EXTENSION_VERSION: "1.0.0",
  }
})

vi.mock("@/utils/i18n", () => ({
  i18n: {
    t: (key: string) => {
      if (key === "uninstallSurveyUrl") return mockState.surveyUrl
      return key
    },
  },
}))

describe("setupUninstallSurvey", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(browser.runtime as any).setUninstallURL = setUninstallURLMock
    mockState.surveyUrl = "https://github.com/yemangran/readbuddy/issues"
  })

  it("sets clean GitHub URL without poll parameters when surveyUrl points to GitHub", async () => {
    mockState.surveyUrl = "https://github.com/yemangran/readbuddy/issues"
    await setupUninstallSurvey()

    expect(setUninstallURLMock).toHaveBeenCalledWith(
      "https://github.com/yemangran/readbuddy/issues",
    )
  })

  it("does not leak legacy upstream rf_ query params for third-party survey URLs", async () => {
    mockState.surveyUrl = "https://survey.example.com/feedback"
    await setupUninstallSurvey()

    expect(setUninstallURLMock).toHaveBeenCalled()
    const calledUrl = new URL(setUninstallURLMock.mock.calls[0]![0])
    expect(calledUrl.searchParams.has("rf_version")).toBe(false)
    expect(calledUrl.searchParams.has("version")).toBe(true)
  })
})
