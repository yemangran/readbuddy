// @vitest-environment jsdom
import type { UiLanguage } from "@/types/config/config"
import { act, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

// This file tests the language boundary seam against the real i18next engine and
// the real bundled YAML locale resources (vitest.config.ts loads them via its
// ViteYaml plugin), so it opts out of the global i18n mocks registered in
// vitest.setup.ts — the same vi.unmock pattern as iconify-internal-api.test.ts.
// Every other test keeps those mocks. These calls are hoisted above the imports below.
vi.unmock("@/utils/i18n")
vi.unmock("@/utils/i18n/locale-boundary")

// Dynamic imports so the unmock calls above take effect for these modules.
const { initI18n, i18n } = await import("@/utils/i18n")
const { LocaleBoundary } = await import("@/utils/i18n/locale-boundary")
const { configAtom, configFieldsAtomMap } = await import("@/utils/atoms/config")
const { DEFAULT_CONFIG } = await import("@/utils/constants/config")

// The child must translate during its own render: the boundary re-keys the subtree
// when the resolved locale changes, remounting this component so it re-translates.
// A precomputed string in the test would NOT update on a language switch.
function AppName() {
  return <span data-testid="app-name">{i18n.t("name")}</span>
}

async function renderBoundaryWithUiLanguage(uiLanguage: UiLanguage) {
  // LocaleBoundary only switches the language of an initialized i18next instance;
  // entrypoints call initI18n after config load and before render, so mirror that.
  await initI18n(uiLanguage)

  // Seed the backing storage as well as the atom (the beta-gating.test.tsx
  // pattern): configAtom.onMount refreshes its value from storage, so an unseeded
  // storage would asynchronously overwrite the atom with DEFAULT_CONFIG
  // (uiLanguage "auto") once that read lands.
  const config = { ...DEFAULT_CONFIG, uiLanguage }
  await fakeBrowser.storage.local.set({ config })

  const store = createStore()
  store.set(configAtom, config)

  render(
    <Provider store={store}>
      <LocaleBoundary>
        <AppName />
      </LocaleBoundary>
    </Provider>,
  )

  return store
}

describe("LocaleBoundary with real locale resources", () => {
  it.each([
    ["en", "Read Buddy"],
    ["zh-CN", "伴读书童"],
    ["zh-TW", "伴讀書童"],
  ] as const)(
    "renders localized content for uiLanguage %s",
    async (uiLanguage, expectedAppName) => {
      await renderBoundaryWithUiLanguage(uiLanguage)

      expect(screen.getByTestId("app-name")).toHaveTextContent(expectedAppName)
    },
  )

  it("updates rendered content when the UI language switches, without a page reload", async () => {
    const store = await renderBoundaryWithUiLanguage("en")
    expect(screen.getByTestId("app-name")).toHaveTextContent("Read Buddy")

    // Switch the UI language the way the settings page does — through the
    // uiLanguage field atom's write path. No reload and no re-render call from
    // the test: the boundary re-keys the subtree and the remounted child
    // re-translates on its first render.
    await act(async () => {
      await store.set(configFieldsAtomMap.uiLanguage, "zh-CN")
    })
    expect(screen.getByTestId("app-name")).toHaveTextContent("伴读书童")

    await act(async () => {
      await store.set(configFieldsAtomMap.uiLanguage, "zh-TW")
    })
    expect(screen.getByTestId("app-name")).toHaveTextContent("伴讀書童")
  })
})
