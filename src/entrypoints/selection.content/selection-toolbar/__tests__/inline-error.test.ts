import { describe, expect, it } from "vitest"
import { i18n } from "@/utils/i18n"
import { createSelectionToolbarRuntimeError } from "../inline-error"

describe("createSelectionToolbarRuntimeError", () => {
  it("extracts SiliconFlow rate limit notice cleanly into description", () => {
    const error = new Error("options.apiProviders.form.siliconflow.rateLimitNotice")
    const runtimeError = createSelectionToolbarRuntimeError("customAction", error)

    expect(runtimeError.title).toBe(i18n.t("options.selectionToolbar.errors.customActionFailed"))
    expect(runtimeError.description).toBe(
      i18n.t("options.apiProviders.form.siliconflow.rateLimitNotice"),
    )
  })

  it("extracts SiliconFlow auth error notice cleanly into description", () => {
    const error = new Error("options.apiProviders.form.siliconflow.authErrorNotice")
    const runtimeError = createSelectionToolbarRuntimeError("customAction", error)

    expect(runtimeError.title).toBe(i18n.t("options.selectionToolbar.errors.customActionFailed"))
    expect(runtimeError.description).toBe(
      i18n.t("options.apiProviders.form.siliconflow.authErrorNotice"),
    )
  })

  it("extracts JSON message from AI SDK error wrapper", () => {
    const rawSdkMessage =
      'Failed after 3 attempts. Last error: AI_APICallError: {"error":{"message":"options.apiProviders.form.siliconflow.rateLimitNotice"}}'
    const error = new Error(rawSdkMessage)
    const runtimeError = createSelectionToolbarRuntimeError("customAction", error)

    expect(runtimeError.description).toBe(
      i18n.t("options.apiProviders.form.siliconflow.rateLimitNotice"),
    )
  })
})
