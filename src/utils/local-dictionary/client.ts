import type {
  CreateManyInput,
  DeleteInput,
  DictionaryReply,
  ListInput,
  ListOutput,
  LocalDictionaryRecord,
  UpdateCellsInput,
} from "./types"
import { storage } from "#imports"
import { sendMessage } from "@/utils/message"

export const DICTIONARY_CHANGE_SIGNAL_STORAGE_KEY = "local:dictionaryChangeSignal"

export async function getDictionaryRecord(
  id: string,
): Promise<DictionaryReply<LocalDictionaryRecord>> {
  return await sendMessage("dictionaryGet", { id })
}

export async function listDictionaryRecords(
  input?: ListInput,
): Promise<DictionaryReply<ListOutput>> {
  return await sendMessage("dictionaryList", input)
}

export async function createDictionaryRecords(
  input: CreateManyInput,
): Promise<DictionaryReply<{ createdIds: string[] }>> {
  return await sendMessage("dictionaryCreateMany", input)
}

export async function updateDictionaryCells(
  input: UpdateCellsInput,
): Promise<DictionaryReply<LocalDictionaryRecord>> {
  return await sendMessage("dictionaryUpdateCells", input)
}

export async function deleteDictionaryRecord(
  input: DeleteInput,
): Promise<DictionaryReply<{ id: string; deleted: boolean }>> {
  return await sendMessage("dictionaryDelete", input)
}

export async function getDictionaryMutationResult(
  requestId: string,
): Promise<DictionaryReply<unknown>> {
  return await sendMessage("dictionaryGetMutationResult", { requestId })
}

export function watchDictionaryChangeSignal(callback: () => void): () => void {
  return storage.watch<number>(DICTIONARY_CHANGE_SIGNAL_STORAGE_KEY, () => {
    callback()
  })
}
