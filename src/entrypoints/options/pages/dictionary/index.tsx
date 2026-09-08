import type { LocalDictionaryRecord } from "@/utils/local-dictionary/types"
import { Icon } from "@iconify/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import {
  Dialog,
  DialogClose,
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
  deleteDictionaryRecord,
  listDictionaryRecords,
  updateDictionaryCells,
  watchDictionaryChangeSignal,
} from "@/utils/local-dictionary/client"
import { queryClient } from "@/utils/tanstack-query"
import { PageLayout } from "../../components/page-layout"

const PAGE_SIZE = 15

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

  useEffect(() => {
    return watchDictionaryChangeSignal(() => {
      void queryClient.invalidateQueries({ queryKey: ["local-dictionary-records"] })
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
      const reply = await updateDictionaryCells({
        requestId: getRandomUUID(),
        id: editingRecord.id,
        cells: editCells,
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

  return (
    <PageLayout
      title={i18n.t("options.dictionary.title")}
      description={i18n.t("options.dictionary.pageDescription")}
      innerClassName="flex flex-col gap-6"
    >
      {/* Search Bar */}
      <div className="flex items-center gap-4">
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
                  <TableRow key={record.id} index={index}>
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
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="edit-record"
                          onClick={() => handleOpenEdit(record)}
                        >
                          <Icon icon="tabler:edit" className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label="delete-record"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingRecord(record)}
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
      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {total} {total === 1 ? "record" : "records"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              {page} / {totalPages}
            </span>
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
        open={!!editingRecord}
        onOpenChange={(open) => {
          if (!open) setEditingRecord(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.editTitle")}</DialogTitle>
          </DialogHeader>

          {editingRecord && (
            <div className="my-2 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {editingRecord.columns.map((col) => (
                <div key={col.id} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{col.name}</label>
                  <Input
                    value={
                      editCells[col.id] !== null && editCells[col.id] !== undefined
                        ? String(editCells[col.id])
                        : ""
                    }
                    onChange={(e) => {
                      setEditCells((prev) => ({
                        ...prev,
                        [col.id]: e.target.value,
                      }))
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              {i18n.t("options.dictionary.cancel")}
            </DialogClose>
            <Button variant="brand" size="sm" disabled={isSavingEdit} onClick={handleSaveEdit}>
              {i18n.t("options.dictionary.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingRecord}
        onOpenChange={(open) => {
          if (!open) setDeletingRecord(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{i18n.t("options.dictionary.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {i18n.t("options.dictionary.deleteConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              {i18n.t("options.dictionary.cancel")}
            </DialogClose>
            <Button variant="destructive" size="sm" disabled={isDeleting} onClick={handleDelete}>
              {i18n.t("options.dictionary.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
