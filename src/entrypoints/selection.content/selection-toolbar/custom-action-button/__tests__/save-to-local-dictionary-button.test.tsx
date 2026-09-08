import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "@/utils/i18n"
import { SaveToLocalDictionaryButton } from "../save-to-local-dictionary-button"

const toastManagerMock = vi.hoisted(() => ({
  add: vi.fn<(...args: any[]) => any>(),
}))

const createDictionaryRecordsMock = vi.hoisted(() => vi.fn<(...args: any[]) => any>())

vi.mock("@/components/ui/base-ui/toast", () => ({
  toastManager: toastManagerMock,
}))

vi.mock("@/utils/local-dictionary/client", () => ({
  createDictionaryRecords: createDictionaryRecordsMock,
}))

const mockDictionaryAction: SelectionToolbarCustomAction = {
  id: "default-dictionary",
  name: "Dictionary",
  enabled: true,
  icon: "tabler:book",
  providerId: "test-provider",
  systemPrompt: "",
  prompt: "",
  outputSchema: [
    {
      id: "default-dictionary-term",
      name: "Term",
      type: "string",
      description: "",
      speaking: true,
    },
    {
      id: "default-dictionary-definition",
      name: "Definition",
      type: "string",
      description: "",
      speaking: false,
    },
  ],
}

const mockCustomAction: SelectionToolbarCustomAction = {
  id: "custom-grammar",
  name: "Grammar Analysis",
  enabled: true,
  icon: "tabler:sparkles",
  providerId: "test-provider",
  systemPrompt: "",
  prompt: "",
  outputSchema: [
    { id: "field-rule", name: "Rule", type: "string", description: "", speaking: false },
  ],
}

describe("SaveToLocalDictionaryButton", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createDictionaryRecordsMock.mockResolvedValue({
      ok: true,
      data: { createdIds: ["new-id"] },
      changeSequence: 1,
    })
  })

  it("is disabled when isRunning is true or result is null", () => {
    const { rerender } = render(
      <SaveToLocalDictionaryButton
        action={mockDictionaryAction}
        isRunning={true}
        result={{ Term: "hello", Definition: "a greeting" }}
      />,
    )

    expect(screen.getByRole("button")).toBeDisabled()

    rerender(
      <SaveToLocalDictionaryButton action={mockDictionaryAction} isRunning={false} result={null} />,
    )

    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("saves built-in dictionary result to local dictionary on click without requiring auth", async () => {
    render(
      <SaveToLocalDictionaryButton
        action={mockDictionaryAction}
        isRunning={false}
        result={{ Term: "hello", Definition: "a greeting" }}
      />,
    )

    const button = screen.getByRole("button", { name: i18n.t("action.saveToLocalDictionary") })
    expect(button).toBeEnabled()

    fireEvent.click(button)

    await waitFor(() => {
      expect(createDictionaryRecordsMock).toHaveBeenCalledTimes(1)
    })

    const callArgs = createDictionaryRecordsMock.mock.calls[0]?.[0]
    expect(callArgs.items).toHaveLength(1)
    expect(callArgs.items[0].actionId).toBe("default-dictionary")
    expect(callArgs.items[0].cells["default-dictionary-term"]).toBe("hello")
    expect(callArgs.items[0].cells["default-dictionary-definition"]).toBe("a greeting")

    expect(toastManagerMock.add).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: i18n.t("action.saveToLocalDictionarySuccess"),
      }),
    )
  })

  it("saves custom AI action result to local dictionary on click", async () => {
    render(
      <SaveToLocalDictionaryButton
        action={mockCustomAction}
        isRunning={false}
        result={{ Rule: "Subjunctive mood" }}
      />,
    )

    const button = screen.getByRole("button", { name: i18n.t("action.saveToLocalDictionary") })
    fireEvent.click(button)

    await waitFor(() => {
      expect(createDictionaryRecordsMock).toHaveBeenCalledTimes(1)
    })

    const callArgs = createDictionaryRecordsMock.mock.calls[0]?.[0]
    expect(callArgs.items[0].actionId).toBe("custom-grammar")
    expect(callArgs.items[0].cells["field-rule"]).toBe("Subjunctive mood")
  })
})
