// @vitest-environment jsdom
import type { UiLanguage } from "@/types/config/config"
import type { DocumentTitleKey } from "@/utils/i18n/locale-boundary"
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
const i18next = (await import("i18next")).default

// The nine UI locales the document-title matrix below runs across.
const SUPPORTED_UI_LOCALES = ["en", "es", "ja", "ko", "ru", "tr", "vi", "zh-CN", "zh-TW"] as const

// One row per extension page that owns a document title: the exact title each
// of the nine supported UI locales composes from the localized page name and
// the localized app name. The translation hub names reuse the terminology of
// the existing options sidebar entry (options.tools.translationHub); the popup
// surface has no prior localized string, so its names are new.
const DOCUMENT_TITLE_MATRIX = [
  {
    key: "documentTitles.options",
    titles: {
      en: "Settings | Read Buddy",
      es: "Ajustes | Read Buddy",
      ja: "設定 | Read Buddy",
      ko: "설정 | Read Buddy",
      ru: "Настройки | Read Buddy",
      tr: "Ayarlar | Read Buddy",
      vi: "Cài đặt | Read Buddy",
      "zh-CN": "设置 | 伴读书童",
      "zh-TW": "設定 | 伴讀書童",
    },
  },
  {
    key: "documentTitles.popup",
    titles: {
      en: "Popup | Read Buddy",
      es: "Ventana emergente | Read Buddy",
      ja: "ポップアップ | Read Buddy",
      ko: "팝업 | Read Buddy",
      ru: "Всплывающее окно | Read Buddy",
      tr: "Açılır pencere | Read Buddy",
      vi: "Cửa sổ bật lên | Read Buddy",
      "zh-CN": "弹窗 | 伴读书童",
      "zh-TW": "彈出視窗 | 伴讀書童",
    },
  },
  {
    key: "documentTitles.translationHub",
    titles: {
      en: "Translation Hub | Read Buddy",
      es: "Centro de traducción | Read Buddy",
      ja: "翻訳ハブ | Read Buddy",
      ko: "번역 허브 | Read Buddy",
      ru: "Центр переводов | Read Buddy",
      tr: "Çeviri Merkezi | Read Buddy",
      vi: "Trung tâm Dịch thuật | Read Buddy",
      "zh-CN": "翻译中心 | 伴读书童",
      "zh-TW": "翻譯中心 | 伴讀書童",
    },
  },
] as const

// Flattened key × locale cases for the title/lang matrix below.
const TITLE_MATRIX_CASES = DOCUMENT_TITLE_MATRIX.flatMap(({ key, titles }) =>
  SUPPORTED_UI_LOCALES.map((uiLanguage) => ({
    key,
    uiLanguage,
    expectedTitle: titles[uiLanguage],
  })),
)

// The child must translate during its own render: the boundary re-keys the subtree
// when the resolved locale changes, remounting this component so it re-translates.
// A precomputed string in the test would NOT update on a language switch.
function AppName() {
  return <span data-testid="app-name">{i18n.t("name")}</span>
}

async function renderBoundaryWithUiLanguage(
  uiLanguage: UiLanguage,
  documentTitleKey?: DocumentTitleKey,
) {
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
      <LocaleBoundary documentTitleKey={documentTitleKey}>
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

  it.each(TITLE_MATRIX_CASES)(
    "localizes the $key document title and html lang for uiLanguage $uiLanguage",
    async ({ key, uiLanguage, expectedTitle }) => {
      await renderBoundaryWithUiLanguage(uiLanguage, key)

      // The exact match also guards against a degenerate title: a locale missing
      // the entry would compose " | <brand>" because the facade's missing-key
      // handler returns an empty string.
      expect(document.title).toBe(expectedTitle)
      expect(document.documentElement.lang).toBe(uiLanguage)
    },
  )

  it.each(DOCUMENT_TITLE_MATRIX)(
    "updates the $key document title and html lang when the UI language switches, without a page reload",
    async ({ key, titles }) => {
      const store = await renderBoundaryWithUiLanguage("en", key)
      expect(screen.getByTestId("app-name")).toHaveTextContent("Read Buddy")
      expect(document.title).toBe(titles.en)
      expect(document.documentElement.lang).toBe("en")

      // Switch the UI language the way the settings page does — through the
      // uiLanguage field atom's write path. No reload and no re-render call from
      // the test: the boundary re-keys the subtree and the remounted child
      // re-translates on its first render.
      await act(async () => {
        await store.set(configFieldsAtomMap.uiLanguage, "zh-CN")
      })
      expect(screen.getByTestId("app-name")).toHaveTextContent("伴读书童")
      expect(document.title).toBe(titles["zh-CN"])
      expect(document.documentElement.lang).toBe("zh-CN")

      await act(async () => {
        await store.set(configFieldsAtomMap.uiLanguage, "zh-TW")
      })
      expect(screen.getByTestId("app-name")).toHaveTextContent("伴讀書童")
      expect(document.title).toBe(titles["zh-TW"])
      expect(document.documentElement.lang).toBe("zh-TW")
    },
  )

  it("does not touch the document title or html lang when no title key is provided", async () => {
    // Content-script roots (host toast, selection, side, subtitles) mount the
    // boundary on HOST pages without a title key; writing the document there
    // would clobber the host page's title and language.
    document.title = "Host page title"
    document.documentElement.lang = "de"

    await renderBoundaryWithUiLanguage("zh-CN")

    expect(screen.getByTestId("app-name")).toHaveTextContent("伴读书童")
    expect(document.title).toBe("Host page title")
    expect(document.documentElement.lang).toBe("de")
  })

  it.each(DOCUMENT_TITLE_MATRIX)(
    "falls back to the English page name for $key when the active locale is missing the entry",
    async ({ key, titles }) => {
      // Simulate a locale lagging behind on the new keys: drop the whole
      // documentTitles namespace from the zh-CN bundle. i18next's per-key fallback
      // then resolves the page name from the default English locale while the
      // brand suffix stays localized. The bundle is restored afterwards so later
      // tests in this file keep seeing the real zh-CN resources.
      const bundle = i18next.getResourceBundle("zh-CN", "translation") as {
        documentTitles?: Record<string, string>
      }
      const savedTitles = bundle.documentTitles
      delete bundle.documentTitles
      try {
        await renderBoundaryWithUiLanguage("zh-CN", key)

        // The English title with the brand suffix re-localized to zh-CN.
        expect(document.title).toBe(titles.en.replace(" | Read Buddy", " | 伴读书童"))
      } finally {
        bundle.documentTitles = savedTitles
      }
    },
  )

  it("follows the browser locale for uiLanguage auto", async () => {
    // resolveUiLocale("auto") degrades to "en" in tests because fakeBrowser's
    // getUILanguage throws; mock it to pin the browser locale to zh-CN.
    const getUiLanguage = vi.spyOn(fakeBrowser.i18n, "getUILanguage").mockReturnValue("zh-CN")
    try {
      await renderBoundaryWithUiLanguage("auto", "documentTitles.options")

      expect(document.title).toBe("设置 | 伴读书童")
      expect(document.documentElement.lang).toBe("zh-CN")
    } finally {
      getUiLanguage.mockRestore()
    }
  })
})
