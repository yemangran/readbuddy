import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { describe, expect, it } from "vitest"
import { sanitizeSelectionToolbarCustomAction } from "../notebase/connection"

function createAction(): SelectionToolbarCustomAction {
  return {
    id: "action-1",
    name: "Custom AI Action",
    icon: "tabler:bolt",
    providerId: "provider-1",
    systemPrompt: "system",
    prompt: "prompt",
    outputSchema: [
      {
        id: "field-summary",
        name: "summary",
        type: "string",
        description: "",
        speaking: false,
      },
      {
        id: "field-score",
        name: "score",
        type: "number",
        description: "",
        speaking: false,
      },
    ],
    notebaseConnection: undefined,
  }
}

const connectedAccount = {
  id: "user-1",
  name: "Reader",
  email: "reader@example.com",
  image: null,
}

describe("notebase utils", () => {
  it("sanitizes invalid local mappings when output fields change", () => {
    const action = createAction()
    const mappedAction: SelectionToolbarCustomAction = {
      ...action,
      notebaseConnection: {
        notebaseId: "notebase-1",
        notebaseNameSnapshot: "Articles",
        connectedAccount,
        mappings: [
          {
            id: "mapping-1",
            localFieldId: "field-summary",
            notebaseColumnId: "column-summary",
            notebaseColumnNameSnapshot: "Summary",
          },
          {
            id: "mapping-2",
            localFieldId: "field-missing",
            notebaseColumnId: "column-score",
            notebaseColumnNameSnapshot: "Score",
          },
        ],
      },
    }

    const sanitized = sanitizeSelectionToolbarCustomAction(mappedAction)

    expect(sanitized.notebaseConnection?.mappings).toHaveLength(1)
    expect(sanitized.notebaseConnection?.mappings[0]?.localFieldId).toBe("field-summary")
  })
})
