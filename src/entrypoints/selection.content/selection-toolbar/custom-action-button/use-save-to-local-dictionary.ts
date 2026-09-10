import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import type {
  CreateVocabularyItem,
  LocalDictionaryColumn,
  LocalDictionaryMapping,
} from "@/utils/local-dictionary/types"
import { useState } from "react"
import { toastManager } from "@/components/ui/base-ui/toast"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { i18n } from "@/utils/i18n"
import { createDictionaryRecords } from "@/utils/local-dictionary/client"

export function buildLocalDictionaryItem(
  action: SelectionToolbarCustomAction,
  result: Record<string, unknown>,
): CreateVocabularyItem {
  const columns: LocalDictionaryColumn[] = action.outputSchema.map((field, index) => ({
    id: field.id,
    name: field.name,
    position: index,
    config: { type: field.type },
  }))

  const mappings: LocalDictionaryMapping[] = action.outputSchema.map((field) => ({
    id: getRandomUUID(),
    localFieldId: field.id,
    notebaseColumnId: field.id,
    notebaseColumnNameSnapshot: field.name,
  }))

  const cells: Record<string, string | number | null> = {}
  for (const field of action.outputSchema) {
    const rawVal = result[field.name]
    if (rawVal === undefined || rawVal === null) {
      cells[field.id] = null
    } else if (typeof rawVal === "number") {
      cells[field.id] = rawVal
    } else if (typeof rawVal === "string") {
      cells[field.id] = rawVal
    } else {
      cells[field.id] = JSON.stringify(rawVal)
    }
  }

  return {
    id: getRandomUUID(),
    actionId: action.id,
    actionName: action.name,
    outputSchema: action.outputSchema,
    result,
    columns,
    mappings,
    cells,
  }
}

export function useSaveToLocalDictionary(currentResult?: Record<string, unknown> | null) {
  const [isSaving, setIsSaving] = useState(false)
  const [prevResult, setPrevResult] = useState(currentResult)
  const [isSaved, setIsSaved] = useState(false)

  if (currentResult !== prevResult) {
    setPrevResult(currentResult)
    setIsSaved(false)
  }

  const saveMany = async ({
    action,
    results,
  }: {
    action: SelectionToolbarCustomAction
    results: Record<string, unknown>[]
  }): Promise<boolean> => {
    if (isSaving || results.length === 0) return false
    setIsSaving(true)
    try {
      const items = results.map((res) => buildLocalDictionaryItem(action, res))
      const requestId = getRandomUUID()
      const reply = await createDictionaryRecords({
        requestId,
        items,
      })

      if (reply.ok) {
        setIsSaved(true)
        toastManager.add({
          type: "success",
          title: i18n.t("action.saveToLocalDictionarySuccess"),
        })
        return true
      }

      toastManager.add({
        type: "error",
        title: i18n.t("action.saveToLocalDictionaryFailed"),
        description: reply.error.message,
      })
      return false
    } catch (error: any) {
      toastManager.add({
        type: "error",
        title: i18n.t("action.saveToLocalDictionaryFailed"),
        description: error?.message,
      })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const save = async ({
    action,
    result,
  }: {
    action: SelectionToolbarCustomAction
    result: Record<string, unknown>
  }): Promise<boolean> => {
    if (isSaving || isSaved) return false
    return saveMany({ action, results: [result] })
  }

  return { save, saveMany, isSaving, isSaved }
}
