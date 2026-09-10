import type {
  DictionarySnapshotV1,
  ImportPreviewResult,
  LocalDictionaryRecord,
  PortableDictionaryRecord,
} from "@/utils/local-dictionary/types"
import { Icon } from "@iconify/react"
import { useQuery } from "@tanstack/react-query"
import { saveAs } from "file-saver"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/base-ui/dialog"
import { Input } from "@/components/ui/base-ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/base-ui/table"
import { toastManager } from "@/components/ui/base-ui/toast"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { i18n } from "@/utils/i18n"
import {
  commitDictionaryImport,
  deleteDictionaryRecord,
  exportDictionarySnapshot,
  listConflictVersions,
  listDictionaryRecords,
  previewDictionaryImport,
  purgeAllDeletedDictionaryRecords,
  purgeDictionaryRecord,
  restoreConflictVersionAsNew,
  restoreDeletedDictionaryRecord,
  updateDictionaryCells,
  watchDictionaryChangeSignal,
} from "@/utils/local-dictionary/client"
import { parseAndValidateSnapshot } from "@/utils/local-dictionary/snapshot"
import { cn } from "@/utils/styles/utils"
import { queryClient } from "@/utils/tanstack-query"
import { PageLayout } from "../../components/page-layout"

const PAGE_SIZE = 15

interface ExtractedRecordFields {
  term: string
  phonetic: string
  partOfSpeech: string
  definition: string
  sentence: string
  sentenceTranslation: string
  difficulty: string
  otherFields: Array<{ id: string; label: string; value: string }>
}

function extractRecordFields(record: LocalDictionaryRecord): ExtractedRecordFields {
  let term = ""
  let phonetic = ""
  let partOfSpeech = ""
  let definition = ""
  let sentence = ""
  let sentenceTranslation = ""
  let difficulty = ""
  const otherFields: Array<{ id: string; label: string; value: string }> = []

  for (const col of record.columns) {
    const rawVal = record.cells[col.id]
    if (rawVal === null || rawVal === undefined || rawVal === "") continue
    const valStr = String(rawVal)
    const keyLower = (col.name || col.id).toLowerCase()

    if (
      keyLower.includes("term") ||
      keyLower.includes("词条") ||
      keyLower.includes("word") ||
      keyLower.includes("单词")
    ) {
      if (!term) term = valStr
      else otherFields.push({ id: col.id, label: col.name || col.id, value: valStr })
    } else if (keyLower.includes("phonetic") || keyLower.includes("音标")) {
      if (!phonetic) phonetic = valStr
      else otherFields.push({ id: col.id, label: col.name || col.id, value: valStr })
    } else if (
      keyLower.includes("partofspeech") ||
      keyLower.includes("pos") ||
      keyLower.includes("词性")
    ) {
      if (!partOfSpeech) partOfSpeech = valStr
      else otherFields.push({ id: col.id, label: col.name || col.id, value: valStr })
    } else if (
      keyLower.includes("definition") ||
      keyLower.includes("释义") ||
      keyLower.includes("meaning")
    ) {
      if (!definition) definition = valStr
      else otherFields.push({ id: col.id, label: col.name || col.id, value: valStr })
    } else if (
      keyLower.includes("sentencetranslation") ||
      keyLower.includes("句子翻译") ||
      keyLower.includes("例句翻译")
    ) {
      if (!sentenceTranslation) sentenceTranslation = valStr
      else otherFields.push({ id: col.id, label: col.name || col.id, value: valStr })
    } else if (
      keyLower.includes("sentence") ||
      keyLower.includes("句子") ||
      keyLower.includes("例句")
    ) {
      if (!sentence) sentence = valStr
      else otherFields.push({ id: col.id, label: col.name || col.id, value: valStr })
    } else if (
      keyLower.includes("difficulty") ||
      keyLower.includes("难度") ||
      keyLower.includes("cefr") ||
      keyLower.includes("level")
    ) {
      if (!difficulty) difficulty = valStr
      else otherFields.push({ id: col.id, label: col.name || col.id, value: valStr })
    } else {
      otherFields.push({ id: col.id, label: col.name || col.id, value: valStr })
    }
  }

  // Fallback: if no term found, use the first non-empty cell
  if (!term) {
    for (const col of record.columns) {
      const val = record.cells[col.id]
      if (val !== null && val !== undefined && val !== "") {
        term = String(val)
        break
      }
    }
  }

  return {
    term,
    phonetic,
    partOfSpeech,
    definition,
    sentence,
    sentenceTranslation,
    difficulty,
    otherFields,
  }
}

export function DictionaryPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")

  // Edit dialog state
  const [editingRecord, setEditingRecord] = useState<LocalDictionaryRecord | null>(null)
  const [editCells, setEditCells] = useState<Record<string, string | number | null>>({})
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Delete dialog state
  const [deletingRecord, setDeletingRecord] = useState<LocalDictionaryRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const navigate = useNavigate()

  // Viewing detail dialog state
  const [viewingRecord, setViewingRecord] = useState<LocalDictionaryRecord | null>(null)

  // History & conflicts dialog state
  const [historyRecord, setHistoryRecord] = useState<LocalDictionaryRecord | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  // Recycle bin state
  const [isTrashOpen, setIsTrashOpen] = useState(false)
  const [trashPage, setTrashPage] = useState(1)
  const [isRestoringTrashId, setIsRestoringTrashId] = useState<string | null>(null)
  const [purgingRecord, setPurgingRecord] = useState<LocalDictionaryRecord | null>(null)
  const [isPurging, setIsPurging] = useState(false)
  const [isPurgeAllDialogOpen, setIsPurgeAllDialogOpen] = useState(false)
  const [isPurgingAll, setIsPurgingAll] = useState(false)

  // Snapshot Export state
  const [isExporting, setIsExporting] = useState(false)

  // Snapshot Import dialog state
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importSnapshot, setImportSnapshot] = useState<DictionarySnapshotV1 | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const { data, isPending } = useQuery({
    queryKey: ["local-dictionary-records", page, search],
    queryFn: async () => {
      const reply = await listDictionaryRecords({
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
      })
      if (!reply.ok) {
        throw new Error(reply.error.message || "Failed to load dictionary records")
      }
      return reply.data
    },
  })

  const { data: trashData, isPending: isLoadingTrash } = useQuery({
    queryKey: ["local-dictionary-trash", trashPage],
    queryFn: async () => {
      const reply = await listDictionaryRecords({
        page: trashPage,
        pageSize: PAGE_SIZE,
        deletedOnly: true,
      })
      if (!reply.ok) {
        throw new Error(reply.error.message || "Failed to load recycle bin records")
      }
      return reply.data
    },
  })

  const historyRecordId = historyRecord?.id
  const { data: conflictVersions, isPending: isLoadingConflicts } = useQuery({
    queryKey: ["local-dictionary-conflicts", historyRecordId],
    enabled: Boolean(historyRecordId),
    queryFn: async () => {
      if (!historyRecordId) return []
      const reply = await listConflictVersions(historyRecordId)
      if (!reply.ok) {
        throw new Error(reply.error.message || "Failed to load conflict versions")
      }
      return reply.data
    },
  })

  useEffect(() => {
    return watchDictionaryChangeSignal(() => {
      void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      void queryClient.invalidateQueries({ queryKey: ["local-dictionary-trash"] })
      void queryClient.invalidateQueries({ queryKey: ["local-dictionary-conflicts"] })
    })
  }, [])

  const records = data?.records ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleOpenEdit = (record: LocalDictionaryRecord) => {
    setEditingRecord(record)
    setEditCells({ ...record.cells })
  }

  const handleSaveEdit = async () => {
    if (!editingRecord) return
    setIsSavingEdit(true)
    try {
      const normalizedCells: Record<string, string | number | null> = {}
      for (const col of editingRecord.columns) {
        const val = editCells[col.id]
        if (val === undefined || val === null || val === "") {
          normalizedCells[col.id] = null
        } else if (
          col.config?.type === "number" ||
          typeof editingRecord.cells[col.id] === "number"
        ) {
          const num = Number(val)
          normalizedCells[col.id] = Number.isNaN(num) ? val : num
        } else {
          normalizedCells[col.id] = val
        }
      }

      const reply = await updateDictionaryCells({
        requestId: getRandomUUID(),
        id: editingRecord.id,
        cells: normalizedCells,
        expectedRevision: editingRecord.localRevision,
      })

      if (reply.ok) {
        setEditingRecord(null)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else {
        if (reply.error.code === "EDIT_CONFLICT") {
          toastManager.add({
            type: "error",
            title: i18n.t("options.dictionary.conflictWarning"),
          })
          void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
        } else {
          toastManager.add({
            type: "error",
            title: reply.error.message || "Failed to update record",
          })
        }
      }
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingRecord) return
    setIsDeleting(true)
    try {
      const reply = await deleteDictionaryRecord({
        requestId: getRandomUUID(),
        id: deletingRecord.id,
        expectedRevision: deletingRecord.localRevision,
      })

      if (reply.ok) {
        setDeletingRecord(null)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else {
        toastManager.add({
          type: "error",
          title: reply.error.message || "Failed to delete record",
        })
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await exportDictionarySnapshot()
      if (res.ok) {
        const blob = new Blob([res.data], { type: "application/json" })
        saveAs(blob, "readfrog.json")
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.exportSuccess"),
        })
      } else {
        toastManager.add({
          type: "error",
          title: res.error.message || "Failed to export snapshot",
        })
      }
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError(null)
    setImportPreview(null)
    setImportSnapshot(null)

    try {
      const text = await file.text()
      const parseResult = parseAndValidateSnapshot(text)
      if (!parseResult.ok) {
        setImportError(parseResult.error)
        return
      }

      setImportSnapshot(parseResult.snapshot)
      const previewRes = await previewDictionaryImport(parseResult.snapshot)
      if (!previewRes.ok) {
        setImportError(previewRes.error.message || "Preview failed")
        return
      }

      setImportPreview(previewRes.data)
      if (previewRes.data.errors.length > 0) {
        setImportError(previewRes.data.errors.join("; "))
      }
    } catch (err: any) {
      setImportError(err?.message || "Failed to read file")
    }
  }

  const handleConfirmImport = async () => {
    if (!importSnapshot || !importPreview) return
    setIsImporting(true)
    try {
      const reply = await commitDictionaryImport({
        requestId: getRandomUUID(),
        snapshot: importSnapshot,
        expectedSequence: importPreview.expectedSequence,
        snapshotHash: importPreview.snapshotHash,
      })

      if (reply.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.importSuccess"),
        })
        setIsImportOpen(false)
        setImportSnapshot(null)
        setImportPreview(null)
        setImportError(null)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else {
        if (reply.error.code === "EDIT_CONFLICT") {
          toastManager.add({
            type: "error",
            title: i18n.t("options.dictionary.importConflict"),
          })
          // Re-trigger preview
          const previewRes = await previewDictionaryImport(importSnapshot)
          if (previewRes.ok) {
            setImportPreview(previewRes.data)
          }
        } else {
          toastManager.add({
            type: "error",
            title: reply.error.message || "Failed to commit import",
          })
        }
      }
    } finally {
      setIsImporting(false)
    }
  }

  const handleRestoreConflict = async (conflict: PortableDictionaryRecord) => {
    setIsRestoring(true)
    try {
      const reply = await restoreConflictVersionAsNew({
        requestId: getRandomUUID(),
        versionId: {
          id: conflict.id,
          updatedAt: conflict.updatedAt,
          deviceId: conflict.deviceId,
        },
      })

      if (reply.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.restoreSuccess"),
        })
        setHistoryRecord(null)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
      } else {
        toastManager.add({
          type: "error",
          title: reply.error.message || "Failed to restore version",
        })
      }
    } finally {
      setIsRestoring(false)
    }
  }

  const handleRestoreDeletedRecord = async (record: LocalDictionaryRecord) => {
    setIsRestoringTrashId(record.id)
    try {
      const reply = await restoreDeletedDictionaryRecord({
        requestId: getRandomUUID(),
        id: record.id,
      })
      if (reply.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.restoreTrashSuccess"),
        })
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-trash"] })
      } else {
        toastManager.add({
          type: "error",
          title: reply.error.message || "Failed to restore record",
        })
      }
    } finally {
      setIsRestoringTrashId(null)
    }
  }

  const handleConfirmPurgeRecord = async () => {
    if (!purgingRecord) return
    setIsPurging(true)
    try {
      const reply = await purgeDictionaryRecord({
        requestId: getRandomUUID(),
        id: purgingRecord.id,
      })
      if (reply.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.purgeSuccess"),
        })
        setPurgingRecord(null)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-trash"] })
      } else {
        toastManager.add({
          type: "error",
          title: reply.error.message || "Failed to purge record",
        })
      }
    } finally {
      setIsPurging(false)
    }
  }

  const handleConfirmPurgeAll = async () => {
    setIsPurgingAll(true)
    try {
      const reply = await purgeAllDeletedDictionaryRecords()
      if (reply.ok) {
        toastManager.add({
          type: "success",
          title: i18n.t("options.dictionary.purgeAllSuccess"),
        })
        setIsPurgeAllDialogOpen(false)
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
        void queryClient.invalidateQueries({ queryKey: ["local-dictionary-trash"] })
      } else {
        toastManager.add({
          type: "error",
          title: reply.error.message || "Failed to purge all deleted records",
        })
      }
    } finally {
      setIsPurgingAll(false)
    }
  }

  return (
    <PageLayout
      title={i18n.t("options.dictionary.title")}
      description={i18n.t("options.dictionary.pageDescription")}
      innerClassName="flex flex-col gap-6"
    >
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Input
            placeholder={i18n.t("options.dictionary.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/preference/webdav-sync")}
            aria-label="open-webdav-sync-settings"
          >
            <Icon icon="tabler:cloud-cog" className="mr-1.5 size-4" />
            {i18n.t("options.dictionary.syncSettings")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTrashPage(1)
              setIsTrashOpen(true)
            }}
            aria-label="open-trash"
          >
            <Icon icon="tabler:trash" className="mr-1.5 size-4" />
            {i18n.t("options.dictionary.trash")}
            {(trashData?.total ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] leading-tight">
                {trashData?.total}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            aria-label="export-snapshot"
          >
            <Icon icon="tabler:download" className="mr-1.5 size-4" />
            {i18n.t("options.dictionary.export")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setImportSnapshot(null)
              setImportPreview(null)
              setImportError(null)
              setIsImportOpen(true)
            }}
            aria-label="import-snapshot"
          >
            <Icon icon="tabler:upload" className="mr-1.5 size-4" />
            {i18n.t("options.dictionary.import")}
          </Button>
        </div>
      </div>

      {/* Records Table */}
      <div className="rounded-lg border bg-card">
        {records.length === 0 && !isPending ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Icon icon="tabler:book-off" className="mb-3 size-10 text-muted-foreground/60" />
            <h3 className="text-base font-medium text-foreground">
              {i18n.t("options.dictionary.emptyTitle")}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {i18n.t("options.dictionary.emptyDescription")}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[45%]">
                  {i18n.t("options.dictionary.columns.cells")}
                </TableHead>
                <TableHead className="w-[20%]">
                  {i18n.t("options.dictionary.columns.action")}
                </TableHead>
                <TableHead className="w-[20%]">
                  {i18n.t("options.dictionary.columns.updatedAt")}
                </TableHead>
                <TableHead className="w-[15%] text-right">
                  {i18n.t("options.dictionary.edit")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record, index) => {
                const cellEntries = Object.entries(record.cells).filter(
                  ([, val]) => val !== null && val !== undefined && val !== "",
                )

                return (
                  <TableRow
                    key={record.id}
                    index={index}
                    onClick={() => setViewingRecord(record)}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="py-3 align-top">
                      <div className="space-y-1">
                        {cellEntries.slice(0, 3).map(([colId, val]) => {
                          const col = record.columns.find((c) => c.id === colId)
                          const label = col?.name || colId
                          return (
                            <div key={colId} className="text-xs">
                              <span className="mr-1 font-semibold text-muted-foreground">
                                {label}:
                              </span>
                              <span className="text-foreground">{String(val)}</span>
                            </div>
                          )
                        })}
                        {cellEntries.length > 3 && (
                          <span className="text-[11px] text-muted-foreground">
                            +{cellEntries.length - 3} more fields
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 align-top">
                      <Badge variant="secondary" className="text-xs">
                        {record.actionName}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 align-top text-xs text-muted-foreground">
                      {new Date(record.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3 text-right align-top">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="view-record-detail"
                          title={i18n.t("options.dictionary.viewDetail")}
                          onClick={(e) => {
                            e.stopPropagation()
                            setViewingRecord(record)
                          }}
                        >
                          <Icon icon="tabler:eye" className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="history-record"
                          title={i18n.t("options.dictionary.history")}
                          onClick={(e) => {
                            e.stopPropagation()
                            setHistoryRecord(record)
                          }}
                        >
                          <Icon icon="tabler:history" className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="edit-record"
                          title={i18n.t("options.dictionary.edit")}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenEdit(record)
                          }}
                        >
                          <Icon icon="tabler:edit" className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="delete-record"
                          title={i18n.t("options.dictionary.delete")}
                          className="text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeletingRecord(record)
                          }}
                        >
                          <Icon icon="tabler:trash" className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {page} / {totalPages} (total: {total})
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit Record Dialog */}
      <Dialog
        open={Boolean(editingRecord)}
        onOpenChange={(open) => !open && setEditingRecord(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.editTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto py-2">
            {editingRecord?.columns.map((col) => (
              <div key={col.id} className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">{col.name}</label>
                <Input
                  type={col.config?.type === "number" ? "number" : "text"}
                  value={String(editCells[col.id] ?? "")}
                  onChange={(e) =>
                    setEditCells((prev) => ({
                      ...prev,
                      [col.id]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingRecord(null)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit}>
              {i18n.t("options.dictionary.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Record Dialog */}
      <Dialog
        open={Boolean(deletingRecord)}
        onOpenChange={(open) => !open && setDeletingRecord(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {i18n.t("options.dictionary.deleteConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeletingRecord(null)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
              {i18n.t("options.dictionary.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History & Conflict Versions Dialog */}
      <Dialog
        open={Boolean(historyRecord)}
        onOpenChange={(open) => !open && setHistoryRecord(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.historyTitle")}</DialogTitle>
            <DialogDescription>{i18n.t("options.dictionary.historyDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-2">
            {isLoadingConflicts ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Loading...</div>
            ) : !conflictVersions || conflictVersions.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {i18n.t("options.dictionary.historyEmpty")}
              </div>
            ) : (
              conflictVersions.map((version) => (
                <div
                  key={`${version.id}-${version.updatedAt}-${version.deviceId}`}
                  className="flex items-start justify-between rounded-md border p-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <span>{new Date(version.updatedAt).toLocaleString()}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {version.deviceId}
                      </Badge>
                      {version.deletedAt && (
                        <Badge variant="destructive" className="text-[10px]">
                          Tombstone
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-0.5 text-muted-foreground">
                      {Object.entries(version.cells).map(([colId, val]) => {
                        const col = version.columns.find((c) => c.id === colId)
                        return (
                          <div key={colId}>
                            <span className="font-semibold">{col?.name || colId}:</span>{" "}
                            {String(val ?? "")}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={isRestoring}
                    onClick={() => handleRestoreConflict(version)}
                  >
                    <Icon icon="tabler:arrow-back-up" className="mr-1 size-3.5" />
                    {i18n.t("options.dictionary.restoreAsNew")}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHistoryRecord(null)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snapshot Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.importTitle")}</DialogTitle>
            <DialogDescription>{i18n.t("options.dictionary.importDescription")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <input
              type="file"
              accept=".json"
              aria-label="snapshot-file-input"
              className="text-xs text-muted-foreground file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
              onChange={handleFileChange}
            />

            {importError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <div className="font-semibold">{i18n.t("options.dictionary.previewErrors")}</div>
                <div className="mt-1">{importError}</div>
              </div>
            )}

            {importPreview && !importError && (
              <div className="rounded-md border bg-muted/30 p-4">
                <h4 className="mb-3 text-xs font-semibold text-foreground">
                  {i18n.t("options.dictionary.preview")}
                </h4>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewAdded")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.addedCount}
                    </span>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewUpdated")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.updatedCount}
                    </span>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewDeleted")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.deletedCount}
                    </span>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewPreserved")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.addedConflictCount}
                    </span>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <span className="text-muted-foreground">
                      {i18n.t("options.dictionary.previewUnchanged")}:
                    </span>
                    <span className="ml-1 font-bold text-foreground">
                      {importPreview.unchangedCount}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsImportOpen(false)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmImport}
              disabled={
                isImporting ||
                !importPreview ||
                Boolean(importError) ||
                importPreview.errors.length > 0
              }
            >
              {i18n.t("options.dictionary.confirmImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Record Detail Dialog */}
      <Dialog
        open={Boolean(viewingRecord)}
        onOpenChange={(open) => !open && setViewingRecord(null)}
      >
        <DialogContent className="max-w-xl">
          {viewingRecord &&
            (() => {
              const fields = extractRecordFields(viewingRecord)
              return (
                <>
                  <DialogHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                        {fields.term || i18n.t("options.dictionary.detailTitle")}
                      </DialogTitle>
                      {fields.phonetic && (
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-sm text-muted-foreground">
                          {fields.phonetic}
                        </span>
                      )}
                      {fields.partOfSpeech && (
                        <Badge variant="secondary" className="text-xs">
                          {fields.partOfSpeech}
                        </Badge>
                      )}
                      {fields.difficulty && (
                        <Badge
                          variant="outline"
                          className="border-primary/40 text-xs font-semibold text-primary"
                        >
                          {fields.difficulty}
                        </Badge>
                      )}
                    </div>
                    <DialogDescription className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                      <span>
                        {i18n.t("options.dictionary.columns.action")}:{" "}
                        {viewingRecord.actionName || viewingRecord.actionId}
                      </span>
                      <span>•</span>
                      <span>
                        {i18n.t("options.dictionary.columns.updatedAt")}:{" "}
                        {new Date(viewingRecord.updatedAt).toLocaleString()}
                      </span>
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto py-2 text-sm">
                    {/* Definition */}
                    {fields.definition && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <div className="mb-1 text-xs font-semibold text-primary">
                          {i18n.t("options.dictionary.definition")}
                        </div>
                        <div className="leading-relaxed text-foreground">{fields.definition}</div>
                      </div>
                    )}

                    {/* Sentence & Translation */}
                    {fields.sentence && (
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="mb-1 text-xs font-semibold text-muted-foreground">
                          {i18n.t("options.dictionary.sentence")}
                        </div>
                        <div className="font-serif leading-relaxed text-foreground italic">
                          "{fields.sentence}"
                        </div>
                        {fields.sentenceTranslation && (
                          <div className="mt-1.5 border-t border-border/50 pt-1.5 text-xs text-muted-foreground">
                            {fields.sentenceTranslation}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Other fields */}
                    {fields.otherFields.length > 0 && (
                      <div className="space-y-2 rounded-lg border p-3 text-xs">
                        {fields.otherFields.map((f) => (
                          <div key={f.id} className="flex items-start gap-2">
                            <span className="shrink-0 font-medium text-muted-foreground">
                              {f.label}:
                            </span>
                            <span className="text-foreground">{f.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <DialogFooter className="flex items-center justify-between sm:justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const rec = viewingRecord
                          setViewingRecord(null)
                          handleOpenEdit(rec)
                        }}
                        aria-label="detail-edit-record"
                      >
                        <Icon icon="tabler:edit" className="mr-1.5 size-4" />
                        {i18n.t("options.dictionary.edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          const rec = viewingRecord
                          setViewingRecord(null)
                          setDeletingRecord(rec)
                        }}
                        aria-label="detail-delete-record"
                      >
                        <Icon icon="tabler:trash" className="mr-1.5 size-4" />
                        {i18n.t("options.dictionary.delete")}
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setViewingRecord(null)}>
                      {i18n.t("options.dictionary.cancel")}
                    </Button>
                  </DialogFooter>
                </>
              )
            })()}
        </DialogContent>
      </Dialog>

      {/* Recycle Bin Dialog */}
      <Dialog open={isTrashOpen} onOpenChange={setIsTrashOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Icon icon="tabler:trash" className="size-5 text-muted-foreground" />
                {i18n.t("options.dictionary.trashTitle")}
              </DialogTitle>
              {(trashData?.total ?? 0) > 0 && (
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={() => setIsPurgeAllDialogOpen(true)}
                  disabled={isPurgingAll}
                  aria-label="empty-trash-btn"
                >
                  <Icon icon="tabler:trash-x" className="mr-1 size-3.5" />
                  {i18n.t("options.dictionary.purgeAll")}
                </Button>
              )}
            </div>
            <DialogDescription className="text-xs">
              {i18n.t("options.dictionary.trashDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto py-2">
            {isLoadingTrash ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Icon icon="tabler:loader-2" className="mr-2 size-5 animate-spin" />
                <span>Loading...</span>
              </div>
            ) : !trashData?.records.length ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Icon icon="tabler:trash-off" className="mb-2 size-8 text-muted-foreground/60" />
                <p className="text-sm font-medium text-foreground">
                  {i18n.t("options.dictionary.trashEmpty")}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[45%]">
                      {i18n.t("options.dictionary.columns.cells")}
                    </TableHead>
                    <TableHead className="w-[20%]">
                      {i18n.t("options.dictionary.columns.action")}
                    </TableHead>
                    <TableHead className="w-[20%]">
                      {i18n.t("options.dictionary.deletedAt")}
                    </TableHead>
                    <TableHead className="w-[15%] text-right">
                      {i18n.t("options.dictionary.edit")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trashData.records.map((record) => {
                    const cellEntries = Object.entries(record.cells).filter(
                      ([, val]) => val !== null && val !== undefined && val !== "",
                    )
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-1 text-xs">
                            {cellEntries.slice(0, 3).map(([key, value]) => {
                              const colDef = record.columns.find((c) => c.id === key)
                              const label = colDef ? colDef.name : key
                              return (
                                <div key={key} className="flex items-start gap-1">
                                  <span className="shrink-0 font-medium text-muted-foreground">
                                    {label}:
                                  </span>
                                  <span className="line-clamp-2 text-foreground">
                                    {String(value)}
                                  </span>
                                </div>
                              )
                            })}
                            {cellEntries.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{cellEntries.length - 3} more
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-xs text-muted-foreground">
                          {record.actionName || record.actionId}
                        </TableCell>
                        <TableCell className="align-top text-xs text-muted-foreground">
                          {record.deletedAt ? new Date(record.deletedAt).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={isRestoringTrashId === record.id}
                              onClick={() => handleRestoreDeletedRecord(record)}
                              aria-label={`restore-record-${record.id}`}
                            >
                              <Icon
                                icon={
                                  isRestoringTrashId === record.id
                                    ? "tabler:loader-2"
                                    : "tabler:rotate-2"
                                }
                                className={cn(
                                  "mr-1 size-3.5",
                                  isRestoringTrashId === record.id && "animate-spin",
                                )}
                              />
                              {i18n.t("options.dictionary.restore")}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => setPurgingRecord(record)}
                              aria-label={`purge-record-${record.id}`}
                            >
                              <Icon icon="tabler:trash-x" className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}

            {(trashData?.total ?? 0) > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t px-2 py-3 text-xs text-muted-foreground">
                <div>
                  Page {trashPage} of {Math.max(1, Math.ceil((trashData?.total ?? 0) / PAGE_SIZE))}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={trashPage <= 1}
                    onClick={() => setTrashPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={
                      trashPage >= Math.max(1, Math.ceil((trashData?.total ?? 0) / PAGE_SIZE))
                    }
                    onClick={() =>
                      setTrashPage((p) =>
                        Math.min(Math.ceil((trashData?.total ?? 0) / PAGE_SIZE), p + 1),
                      )
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsTrashOpen(false)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge Single Record Confirmation Dialog */}
      <Dialog
        open={Boolean(purgingRecord)}
        onOpenChange={(open) => !open && setPurgingRecord(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Icon icon="tabler:alert-triangle" className="size-5" />
              {i18n.t("options.dictionary.purgeConfirmTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {i18n.t("options.dictionary.purgeConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPurgingRecord(null)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirmPurgeRecord}
              disabled={isPurging}
              aria-label="confirm-purge-record"
            >
              {i18n.t("options.dictionary.purge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge All Confirmation Dialog */}
      <Dialog open={isPurgeAllDialogOpen} onOpenChange={setIsPurgeAllDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Icon icon="tabler:alert-triangle" className="size-5" />
              {i18n.t("options.dictionary.purgeAllConfirmTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {i18n.t("options.dictionary.purgeAllConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsPurgeAllDialogOpen(false)}>
              {i18n.t("options.dictionary.cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirmPurgeAll}
              disabled={isPurgingAll}
              aria-label="confirm-purge-all"
            >
              {i18n.t("options.dictionary.purgeAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
