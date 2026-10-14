// @vitest-environment jsdom
import type { ProviderConfig } from "@/types/config/provider"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SetApiKeyWarning } from "../set-api-key-warning"

describe("SetApiKeyWarning", () => {
  afterEach(cleanup)

  it("renders nothing when providerConfig is null", () => {
    const { container } = render(<SetApiKeyWarning providerConfig={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing for SiliconFlow in sponsored mode even without apiKey", () => {
    const siliconflowSponsored: ProviderConfig = {
      id: "siliconflow-default",
      name: "SiliconFlow",
      provider: "siliconflow",
      enabled: true,
      apiKey: "",
      baseURL: "https://api.siliconflow.cn/v1",
      model: { model: "tencent/Hunyuan-MT-7B", isCustomModel: false, customModel: null },
      providerSpecificSettings: { authMode: "sponsored" },
    }
    const { container } = render(<SetApiKeyWarning providerConfig={siliconflowSponsored} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders warning for SiliconFlow in BYOK mode when apiKey is missing", () => {
    const siliconflowByokMissingKey: ProviderConfig = {
      id: "siliconflow-default",
      name: "SiliconFlow",
      provider: "siliconflow",
      enabled: true,
      apiKey: "",
      baseURL: "https://api.siliconflow.cn/v1",
      model: { model: "tencent/Hunyuan-MT-7B", isCustomModel: false, customModel: null },
      providerSpecificSettings: { authMode: "byok" },
    }
    render(<SetApiKeyWarning providerConfig={siliconflowByokMissingKey} />)
    expect(screen.getByRole("button", { name: "options.apiProviders.title" })).toBeInTheDocument()
  })

  it("renders nothing for SiliconFlow in BYOK mode when apiKey is set", () => {
    const siliconflowByokWithKey: ProviderConfig = {
      id: "siliconflow-default",
      name: "SiliconFlow",
      provider: "siliconflow",
      enabled: true,
      apiKey: "sk-personal-key",
      baseURL: "https://api.siliconflow.cn/v1",
      model: { model: "tencent/Hunyuan-MT-7B", isCustomModel: false, customModel: null },
      providerSpecificSettings: { authMode: "byok" },
    }
    const { container } = render(<SetApiKeyWarning providerConfig={siliconflowByokWithKey} />)
    expect(container).toBeEmptyDOMElement()
  })
})
