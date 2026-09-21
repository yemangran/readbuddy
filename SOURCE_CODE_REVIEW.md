# Source Code Review - Build Instructions

## Build Environment

- **Node.js**: ^26.7.0 (installed automatically by pnpm from the `devEngines.runtime` field)
- **pnpm**: 12.3.4 (pinned by the `packageManager` field in `package.json`)

## Build Steps

```bash
# 1. Install pnpm if it is not already available
npx get-pnpm

# 2. Install dependencies using the version pinned in package.json
pnpm install --frozen-lockfile

# 3. Build the Firefox extension
pnpm zip:firefox
```

## Environment Variables

The `.env.production` file is included in this archive. It contains:

- `WXT_POSTHOG_HOST` / `WXT_POSTHOG_API_KEY` — Opt-in analytics endpoint and public write key. Analytics stays off unless the user enables it in preferences.
- `WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED` — Toggles the analytics daily-feature cache.

No Google OAuth client ID is required: the extension makes no calls to Google APIs for
configuration sync, so it holds no Google credentials at all.

## Build Output

After a successful build, the packaged extension will be at:

```
.output/read-frogextension-<version>-firefox.zip
```
