# Unified WebDAV Sync Pipeline: Dictionary, Review States, and Preferences

## Context

[ADR 0002](./0002-local-spaced-repetition-review-store.md) decision 3 recorded the WebDAV synchronizer as a **dual-file** mechanism: `readbuddy.json` (vocabulary cards) and `readbuddy-reviews.json` (review states) managed side-by-side. Extension preferences meanwhile lived in a separate cloud path (Google Drive), which is unusable in restricted networks and forced users to manage two cloud accounts for one extension (see the spec `docs/specs/replace-google-drive-with-webdav-config-sync.md`).

This ADR amends ADR 0002 decision 3: the synchronizer is no longer a dual-file mechanism.

## Decision

1. **Three canonical remote files** in the user's WebDAV directory: `readbuddy.json` (vocabulary records), `readbuddy-reviews.json` (review states), and `readbuddy-config.json` (extension preferences). One WebDAV configuration syncs all of them — "configure once, sync everything".
2. **One coordinated pass**: `syncWithWebdav` is the single entry point. Once the dictionary data has settled, the same pass reconciles review states and then preferences. Every trigger — local write debounce, startup, network recovery, alarm retry, and manual "Sync Now" — runs the full pipeline; no trigger syncs a subset.
3. **Component isolation**: each component reports its own outcome in the sync result (`components.dictionary` / `components.reviews` / `components.config`). A non-fatal failure in one component — a corrupted remote config file, an unsupported config schema version, a failing review upload — is a diagnostic, not a failure of the pass: the learning data still syncs. The dictionary component remains the entry gate; when it fails (auth, network, corrupted remote), the pass fails as a whole and the side components are not attempted.
4. **Preferences use Last-Modified-Wins** on the config's `lastModifiedAt`: remote newer → snapshot the local config into the backup history, then apply the remote one; local newer or no remote file → upload, guarded by an ETag `If-Match` / `If-None-Match` precondition. A remote config file served without an ETag is never uploaded over.
5. **Sync state records the preference component**: `configSyncStatus`, `configLastSuccessTime`, `configLastAction`, and `configLastError` describe the most recent pass that attempted preferences, so a user can see when their settings last synced independently of the dictionary.
6. **Divergence from component fatality is deliberate**: config `AUTH_FAILED` and `UNSUPPORTED_VERSION` do not pause the engine, unlike their dictionary equivalents. Pausing would block the dictionary sync too — the opposite of what a unified pipeline promises — so they surface through the preference fields instead.
