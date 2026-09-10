# Read Toad Learning

Read Toad is a browser extension for language learning. Its local-first dictionary keeps saved learning content under the user's control.

## Language

**Dictionary result**:
A structured explanation produced by the Dictionary action for a selected term in context. It is not a history of every lookup.

**Custom AI Action**:
A user-configured action that produces named, typed output fields from selected text and its context.

**Dictionary record**:
A saved learning entry containing an action's structured content and the field definitions needed to interpret it later. A record is distinct from a flashcard or a review.

**Local-First Provider**:
A user-configured local or direct-API service provider (e.g. OpenAI, DeepSeek, Ollama) managed entirely within the extension without upstream cloud proxying or membership checks.
_Avoid_: Built-in AI, Hosted AI, Official Provider

**Notebase**:
The deprecated upstream cloud learning workspace that was coupled to upstream accounts. It is replaced entirely by this fork's local dictionary.
_Avoid_: Cloud dictionary, Online notes

**Sync**:
Reconciliation of saved learning records between devices through a user-configured storage service.

**Backup**:
A retained copy of learning data used to recover an earlier state. It is distinct from keeping devices synchronized.

**Conflict record**:
A retained complete version of a dictionary record that was not selected as the current entry during reconciliation. It may be an ordinary older version rather than a concurrent edit, and can be inspected or restored as a new entry.

**Deleted dictionary record**:
A dictionary entry marked as removed and excluded from the active dictionary. An edit from another device does not by itself restore the entry.

**Restore as new entry**:
An explicit action that creates a separate dictionary entry from retained content. The original deleted entry remains deleted.
