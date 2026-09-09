import { beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import {
  commitDictionaryImport,
  createDictionaryRecords,
  deleteDictionaryRecord,
  exportDictionarySnapshot,
  getDictionaryRecord,
  listConflictVersions,
  listDictionaryRecords,
  previewDictionaryImport,
  restoreConflictVersionAsNew,
  updateDictionaryCells,
  clearWebdavConfig,
  getRemoteWebdavSummary,
  getWebdavConfig,
  getWebdavSyncState,
  saveWebdavConfig,
} from "@/utils/local-dictionary/client"
import { setupLocalDictionaryMessageHandlers } from "../local-dictionary"
import "fake-indexeddb/auto"

describe("Background Local Dictionary Messaging", () => {
  beforeEach(() => {
    fakeBrowser.reset()
    setupLocalDictionaryMessageHandlers()
  })

  it("handles end-to-end messaging for create, get, update, and delete", async () => {
    const item = {
      id: "msg-vocab-1",
      actionId: "default-dictionary",
      actionName: "Dictionary",
      outputSchema: [
        {
          id: "field-1",
          name: "Term",
          type: "string" as const,
          description: "",
          speaking: false,
        },
      ],
      result: { Term: "test-word" },
      columns: [{ id: "c-1", name: "Term", position: 0 }],
      mappings: [
        {
          id: "m-1",
          localFieldId: "field-1",
          notebaseColumnId: "c-1",
          notebaseColumnNameSnapshot: "Term",
        },
      ],
      cells: { "c-1": "test-word" },
    }

    // 1. Create
    const createRes = await createDictionaryRecords({
      requestId: "msg-req-1",
      items: [item],
    })
    expect(createRes.ok).toBe(true)
    if (!createRes.ok) return
    expect(createRes.data.createdIds).toEqual(["msg-vocab-1"])

    // 2. Get
    const getRes = await getDictionaryRecord("msg-vocab-1")
    expect(getRes.ok).toBe(true)
    if (!getRes.ok) return
    expect(getRes.data.cells["c-1"]).toBe("test-word")
    const revision = getRes.data.localRevision

    // 3. Update
    const updateRes = await updateDictionaryCells({
      requestId: "msg-req-2",
      id: "msg-vocab-1",
      cells: { "c-1": "test-word-updated" },
      expectedRevision: revision,
    })
    expect(updateRes.ok).toBe(true)
    if (!updateRes.ok) return
    expect(updateRes.data.cells["c-1"]).toBe("test-word-updated")
    const newRevision = updateRes.data.localRevision

    // 4. List
    const listRes = await listDictionaryRecords({ page: 1, pageSize: 10 })
    expect(listRes.ok).toBe(true)
    if (!listRes.ok) return
    expect(listRes.data.total).toBe(1)
    expect(listRes.data.records[0]?.cells["c-1"]).toBe("test-word-updated")

    // 5. Delete
    const delRes = await deleteDictionaryRecord({
      requestId: "msg-req-3",
      id: "msg-vocab-1",
      expectedRevision: newRevision,
    })
    expect(delRes.ok).toBe(true)

    // Verify gone from active list
    const afterDelList = await listDictionaryRecords()
    expect(afterDelList.ok).toBe(true)
    if (!afterDelList.ok) return
    expect(afterDelList.data.records.length).toBe(0)

    // 6. Conflict versions of deleted record
    const conflictsRes = await listConflictVersions("msg-vocab-1")
    expect(conflictsRes.ok).toBe(true)
    if (!conflictsRes.ok) return
    expect(conflictsRes.data.length).toBe(1)
    expect(conflictsRes.data[0]?.cells["c-1"]).toBe("test-word-updated")

    // 7. Restore as new
    const restoreRes = await restoreConflictVersionAsNew({
      requestId: "msg-req-restore-1",
      versionId: {
        id: "msg-vocab-1",
        updatedAt: conflictsRes.data[0]!.updatedAt,
        deviceId: conflictsRes.data[0]!.deviceId,
      },
    })
    expect(restoreRes.ok).toBe(true)
    if (!restoreRes.ok) return
    expect(restoreRes.data.id).not.toBe("msg-vocab-1")

    // 8. Snapshot export
    const exportRes = await exportDictionarySnapshot()
    expect(exportRes.ok).toBe(true)
    if (!exportRes.ok) return
    expect(exportRes.data).toContain("readfrog-local")

    // 9. Snapshot preview & commit import
    const parsedSnapshot = JSON.parse(exportRes.data)
    const previewRes = await previewDictionaryImport(parsedSnapshot)
    expect(previewRes.ok).toBe(true)
    if (!previewRes.ok) return
    expect(previewRes.data.errors.length).toBe(0)

    const commitRes = await commitDictionaryImport({
      requestId: "msg-req-commit-1",
      snapshot: parsedSnapshot,
      expectedSequence: previewRes.data.expectedSequence,
      snapshotHash: previewRes.data.snapshotHash,
    })
    expect(commitRes.ok).toBe(true)

    // 10. WebDAV config messaging
    const initialConfig = await getWebdavConfig()
    expect(initialConfig).toBeNull()

    const saveRes = await saveWebdavConfig({
      endpoint: "https://dav.example.com/webdav/",
      username: "myuser",
      password: "mypassword",
    })
    expect(saveRes.ok).toBe(true)

    const savedConfig = await getWebdavConfig()
    expect(savedConfig?.endpoint).toBe("https://dav.example.com/webdav/")
    expect(savedConfig?.username).toBe("myuser")

    const clearRes = await clearWebdavConfig()
    expect(clearRes.ok).toBe(true)
    expect(await getWebdavConfig()).toBeNull()

    // 11. WebDAV sync state messaging
    const syncState = await getWebdavSyncState()
    expect(syncState).toBeDefined()
    expect(syncState.phase).toBe("idle")

    // 12. Remote summary when not configured
    const summaryRes = await getRemoteWebdavSummary()
    expect(summaryRes).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "AUTH_FAILED" }),
    })
  })
})
