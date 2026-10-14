// @vitest-environment jsdom
import type { APIProviderConfig } from "@/types/config/provider"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { useEffect, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AutosaveContext, toAutosaveSession } from "@/components/form/use-autosave"
import { SILICONFLOW_DEFAULT_SPONSORED_MODEL } from "@/utils/constants/models"
import { DEFAULT_PROVIDER_CONFIG } from "@/utils/constants/providers"
import { CustomProviderEditor, ProviderEditor, useProviderForm } from "../../provider-editor"

vi.mock("#imports", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light" }),
}))

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({
    isPending: false,
    mutate: vi.fn<() => void>(),
    reset: vi.fn<() => void>(),
  }),
}))

vi.mock("@/components/ui/base-ui/toast", () => ({
  toastManager: { add: vi.fn<(options: unknown) => void>() },
  anchoredToastManager: { add: vi.fn<(options: unknown) => void>() },
}))

const defaultSiliconFlowConfig: APIProviderConfig = {
  ...DEFAULT_PROVIDER_CONFIG.siliconflow,
  id: "siliconflow-default",
  name: "SiliconFlow Default",
}

function SiliconFlowHarness({
  initialConfig = defaultSiliconFlowConfig,
  onPersist,
}: {
  initialConfig?: APIProviderConfig
  onPersist?: (config: APIProviderConfig, changes: Partial<APIProviderConfig>) => void
}) {
  const [providerConfig, setProviderConfig] = useState(initialConfig)
  const { form, autosave } = useProviderForm(providerConfig, async (value, changes) => {
    onPersist?.(value, changes)
    setProviderConfig(value)
  })

  useEffect(() => {
    autosave.reconcile(providerConfig)
  }, [providerConfig, autosave])

  return (
    <AutosaveContext value={toAutosaveSession(autosave)}>
      <CustomProviderEditor.Provider
        providerConfig={providerConfig}
        form={form}
        duplicate={async () => {}}
        delete={async () => {}}
      >
        <ProviderEditor.Form>
          <ProviderEditor.ConfigHeader />
          <ProviderEditor.SiliconFlowAuthModeField />
          <ProviderEditor.NameField />
          <ProviderEditor.DescriptionField />
          <ProviderEditor.ConnectionFields />
          <ProviderEditor.ProviderSpecificFields />
          <ProviderEditor.TranslationModelFields />
        </ProviderEditor.Form>
      </CustomProviderEditor.Provider>
    </AutosaveContext>
  )
}

describe("SiliconFlow dual-mode UI", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("renders mode switcher for SiliconFlow provider and hides it for other providers", () => {
    const { unmount } = render(<SiliconFlowHarness initialConfig={defaultSiliconFlowConfig} />)
    expect(
      screen.getByRole("tab", { name: "options.apiProviders.form.siliconflow.sponsoredMode" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("tab", { name: "options.apiProviders.form.siliconflow.byokMode" }),
    ).toBeInTheDocument()

    unmount()

    render(<SiliconFlowHarness initialConfig={DEFAULT_PROVIDER_CONFIG.openai} />)
    expect(
      screen.queryByRole("tab", { name: "options.apiProviders.form.siliconflow.sponsoredMode" }),
    ).not.toBeInTheDocument()
  })

  it("displays sponsored banner and hides API key and API URL in sponsored mode", () => {
    render(<SiliconFlowHarness initialConfig={defaultSiliconFlowConfig} />)

    // Sponsored notice banner is visible
    expect(
      screen.getByText("options.apiProviders.form.siliconflow.sponsoredNoticeTitle"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("options.apiProviders.form.siliconflow.sponsoredNoticeDescription"),
    ).toBeInTheDocument()

    // API Key and Base URL inputs are hidden
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText("options.apiProviders.form.fields.baseURL"),
    ).not.toBeInTheDocument()
  })

  it("restricts model selector to the 3 sponsored models and hides custom model option in sponsored mode", () => {
    render(<SiliconFlowHarness initialConfig={defaultSiliconFlowConfig} />)

    // Custom model checkbox should not be in the document
    expect(
      screen.queryByText("options.apiProviders.form.models.enterCustomModel"),
    ).not.toBeInTheDocument()

    // The select options trigger should be in document
    const selectTrigger = screen.getByRole("combobox")
    expect(selectTrigger).toBeInTheDocument()
  })

  it("displays API key, Get API Key button, Connection Test button, and API URL in BYOK mode", () => {
    const byokConfig: APIProviderConfig = {
      ...defaultSiliconFlowConfig,
      apiKey: "sk-my-secret-key",
      providerSpecificSettings: {
        authMode: "byok",
      },
    }

    render(<SiliconFlowHarness initialConfig={byokConfig} />)

    // Sponsored notice banner should not be present
    expect(
      screen.queryByText("options.apiProviders.form.siliconflow.sponsoredNoticeTitle"),
    ).not.toBeInTheDocument()

    // API Key input is displayed
    const apiKeyInput = screen.getByLabelText("API Key")
    expect(apiKeyInput).toBeInTheDocument()
    expect(apiKeyInput).toHaveValue("sk-my-secret-key")

    // Show API Key checkbox label is displayed
    expect(screen.getByText("options.apiProviders.apiKey.showAPIKey")).toBeInTheDocument()

    // Get API Key link button is displayed
    expect(screen.getByText("options.apiProviders.apiKey.getAPIKey")).toBeInTheDocument()

    // Connection test button is displayed
    expect(
      screen.getByRole("button", { name: "options.apiProviders.testConnection.button" }),
    ).toBeInTheDocument()

    // Base URL field is displayed
    expect(screen.getByLabelText("options.apiProviders.form.fields.baseURL")).toBeInTheDocument()

    // Custom model checkbox is displayed
    expect(
      screen.getByText("options.apiProviders.form.models.enterCustomModel"),
    ).toBeInTheDocument()
  })

  it("preserves previously typed API key when toggling between BYOK and sponsored modes", async () => {
    const persistSpy = vi.fn<(...args: any[]) => void>()
    const byokConfig: APIProviderConfig = {
      ...defaultSiliconFlowConfig,
      apiKey: "sk-preserved-key-12345",
      providerSpecificSettings: {
        authMode: "byok",
      },
    }

    render(<SiliconFlowHarness initialConfig={byokConfig} onPersist={persistSpy} />)

    expect(screen.getByLabelText("API Key")).toHaveValue("sk-preserved-key-12345")

    // Switch to Sponsored mode
    const sponsoredTab = screen.getByRole("tab", {
      name: "options.apiProviders.form.siliconflow.sponsoredMode",
    })
    fireEvent.click(sponsoredTab)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    // API key field is hidden, banner is shown
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument()
    expect(
      screen.getByText("options.apiProviders.form.siliconflow.sponsoredNoticeTitle"),
    ).toBeInTheDocument()

    // Switch back to BYOK mode
    const byokTab = screen.getByRole("tab", {
      name: "options.apiProviders.form.siliconflow.byokMode",
    })
    fireEvent.click(byokTab)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    // API key field returns with the preserved value
    const restoredApiKeyInput = screen.getByLabelText("API Key")
    expect(restoredApiKeyInput).toBeInTheDocument()
    expect(restoredApiKeyInput).toHaveValue("sk-preserved-key-12345")
  })

  it("resets custom model and non-sponsored model to default sponsored model when switching to sponsored mode", async () => {
    const persistSpy = vi.fn<(...args: any[]) => void>()
    const byokWithNonSponsoredModel: APIProviderConfig = {
      ...defaultSiliconFlowConfig,
      apiKey: "sk-my-key",
      model: {
        model: "Qwen/Qwen3-Next-80B-A3B-Instruct",
        isCustomModel: false,
        customModel: null,
      },
      providerSpecificSettings: {
        authMode: "byok",
      },
    }

    render(<SiliconFlowHarness initialConfig={byokWithNonSponsoredModel} onPersist={persistSpy} />)

    // Switch to Sponsored mode
    const sponsoredTab = screen.getByRole("tab", {
      name: "options.apiProviders.form.siliconflow.sponsoredMode",
    })
    fireEvent.click(sponsoredTab)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    // Custom model option is hidden
    expect(
      screen.queryByText("options.apiProviders.form.models.enterCustomModel"),
    ).not.toBeInTheDocument()

    // Persisted call contains reset model
    expect(persistSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({
          isCustomModel: false,
          model: SILICONFLOW_DEFAULT_SPONSORED_MODEL,
        }),
        providerSpecificSettings: expect.objectContaining({
          authMode: "sponsored",
        }),
      }),
      expect.anything(),
    )
  })

  it("autosaves changes under providerSpecificSettings.authMode", async () => {
    const persistSpy = vi.fn<(...args: any[]) => void>()
    render(<SiliconFlowHarness initialConfig={defaultSiliconFlowConfig} onPersist={persistSpy} />)

    // Switch to BYOK
    const byokTab = screen.getByRole("tab", {
      name: "options.apiProviders.form.siliconflow.byokMode",
    })
    fireEvent.click(byokTab)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(persistSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSpecificSettings: expect.objectContaining({
          authMode: "byok",
        }),
      }),
      expect.objectContaining({
        providerSpecificSettings: {
          authMode: "byok",
        },
      }),
    )
  })
})
