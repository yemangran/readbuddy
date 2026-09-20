import type { LocalDictionaryRecord } from "@/utils/local-dictionary/types"
import { Icon } from "@iconify/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { storage } from "#imports"
import { i18n } from "@/utils/i18n"
import { listDictionaryRecords } from "@/utils/local-dictionary/client"
import { openOptionsPage } from "@/utils/navigation"
import { reviewStore } from "@/utils/review/store"
import { cn } from "@/utils/styles/utils"
import { version } from "../../../package.json"
import { AISmartContext } from "./components/ai-smart-context"
import { AlwaysTranslate } from "./components/always-translate"
import { PopupBrandHeader } from "./components/brand-header"
import LanguageOptionsSelector from "./components/language-options-selector"
import { LearningTab } from "./components/learning-tab"
import { MoreMenu } from "./components/more-menu"
import Hotkey from "./components/node-translation-hotkey-selector"
import ProvidersField from "./components/providers-field"
import { SiteControlToggle } from "./components/site-control-toggle"
import TranslateButton from "./components/translate-button"
import TranslatePromptSelector from "./components/translate-prompt-selector"
import { TranslationHubButton } from "./components/translation-hub-button"
import TranslationModeSelector from "./components/translation-mode-selector"

export const POPUP_ACTIVE_TAB_STORAGE_KEY = "local:activePopupTab"
export type PopupTab = "translate" | "learning"

const EMPTY_RECORDS: LocalDictionaryRecord[] = []

function App() {
  const [activeTab, setActiveTab] = useState<PopupTab>("translate")
  const [dueCount, setDueCount] = useState(0)

  // Restore persisted tab on mount
  useEffect(() => {
    void storage.getItem<PopupTab>(POPUP_ACTIVE_TAB_STORAGE_KEY).then((saved) => {
      if (saved === "translate" || saved === "learning") {
        setActiveTab(saved)
      }
    })
  }, [])

  const handleTabChange = (tab: PopupTab) => {
    setActiveTab(tab)
    void storage.setItem(POPUP_ACTIVE_TAB_STORAGE_KEY, tab)
  }

  // Query local dictionary records for due count & learning tab
  const { data: dictReply, isLoading: isDictLoading } = useQuery({
    queryKey: ["popupDictionaryRecords"],
    queryFn: async () => {
      return await listDictionaryRecords({ page: 1, pageSize: 500 })
    },
  })

  const records = useMemo(
    () => (dictReply?.ok ? dictReply.data.records : EMPTY_RECORDS),
    [dictReply],
  )

  useEffect(() => {
    let cancelled = false
    void reviewStore.getDueCount(records).then((count) => {
      if (!cancelled) {
        setDueCount(count)
      }
    })
    return () => {
      cancelled = true
    }
  }, [records])

  return (
    <>
      <div className="flex flex-col gap-3.5 bg-background px-5 pt-4 pb-4">
        {/* Brand header */}
        <div className="flex items-center justify-between gap-2">
          <PopupBrandHeader />
          <div className="flex shrink-0 items-center">
            <TranslationHubButton />
          </div>
        </div>

        {/* Dual Tab Switcher */}
        <div className="grid grid-cols-2 rounded-lg bg-muted/60 p-1 text-xs font-medium">
          <button
            type="button"
            className={cn(
              "flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 transition-all",
              activeTab === "translate"
                ? "bg-background font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => handleTabChange("translate")}
          >
            <Icon icon="tabler:language" className="size-3.5" />
            <span>翻译配置</span>
          </button>
          <button
            type="button"
            className={cn(
              "relative flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 transition-all",
              activeTab === "learning"
                ? "bg-background font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => handleTabChange("learning")}
          >
            <Icon icon="tabler:cards" className="size-3.5" />
            <span>本地学习</span>
            {dueCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none font-bold text-white">
                {dueCount > 99 ? "99+" : dueCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "translate" ? (
          <div className="flex flex-col gap-4">
            <LanguageOptionsSelector />
            <ProvidersField />
            <TranslatePromptSelector />
            <div className="flex w-full items-center gap-2">
              <TranslationModeSelector />
              <TranslateButton className="min-w-0 flex-1" />
            </div>
            <SiteControlToggle />
            <AlwaysTranslate />
            <Hotkey />
            <AISmartContext />
          </div>
        ) : (
          <LearningTab
            records={records}
            dueCount={dueCount}
            isLoading={isDictLoading}
            onOpenFullscreenReview={() => {
              void openOptionsPage({ route: "/dictionary?mode=review" })
            }}
            onOpenDictionary={() => {
              void openOptionsPage({ route: "/dictionary" })
            }}
          />
        )}
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between bg-neutral-200 px-2 py-1 dark:bg-neutral-800">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-300 dark:hover:bg-neutral-700"
          onClick={() => {
            void openOptionsPage()
          }}
        >
          <Icon icon="tabler:settings" className="size-4" strokeWidth={1.6} />
          <span className="text-[13px] font-medium">{i18n.t("popup.options")}</span>
        </button>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{version}</span>
        <MoreMenu />
      </div>
    </>
  )
}

export default App
