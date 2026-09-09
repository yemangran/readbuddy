import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"
import { useSaveToLocalDictionary } from "./use-save-to-local-dictionary"

export function SaveToLocalDictionaryButton({
  action,
  isRunning,
  result,
}: {
  action: SelectionToolbarCustomAction
  isRunning: boolean
  result: Record<string, unknown> | null
}) {
  const { save, isSaving, isSaved } = useSaveToLocalDictionary(result)

  const handleClick = () => {
    if (!result || isSaved || isSaving) return
    void save({ action, result })
  }

  const isDisabled = isRunning || !result || isSaving || isSaved

  return (
    <Button type="button" size="sm" variant="outline" disabled={isDisabled} onClick={handleClick}>
      {isSaving
        ? i18n.t("action.saveToLocalDictionarySaving")
        : isSaved
          ? i18n.t("action.saveToLocalDictionarySaved")
          : i18n.t("action.saveToLocalDictionary")}
    </Button>
  )
}
