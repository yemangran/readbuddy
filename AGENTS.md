# AGENTS.md

## Testing Notes

- `src/utils/host/translate/api/__tests__/free-api.test.ts` depends on live external translation services.
- When running tests locally as an AI agent, set `SKIP_FREE_API=true`.
- If `SKIP_FREE_API=true` is set, treat `free-api.test.ts` as intentionally skipped during local validation.

## PR Notes

- PR titles must use conventional commit format, such as `fix(subtitles): ...`; avoid extra prefixes like `[codex]`.
- User-facing fixes and features should include a `.changeset/*.md` file for `@read-frog/extension` unless the change intentionally does not need a release. use conventional commit format for the changeset content.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues using `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
