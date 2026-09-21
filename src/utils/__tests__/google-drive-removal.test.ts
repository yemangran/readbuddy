import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * Boundary guard for the extension's cloud sync surface.
 *
 * Extension preferences used to sync through Google Drive: an OAuth implicit
 * flow, a Drive appdata client, and a three-way conflict dialog. All of it is
 * gone — preferences now ride the same WebDAV pipeline as the dictionary and
 * review data (see docs/specs/replace-google-drive-with-webdav-config-sync.md).
 *
 * Google Drive is unusable behind restricted networks and was the extension's
 * last reason to hold a Google client ID. This guard keeps the whole surface —
 * modules, hooks, atoms, storage keys, env vars, locale entries, and Google
 * endpoints — from creeping back in.
 */

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url))
const REPO_ROOT = path.join(SRC_ROOT, "../")

/** Modules that made up the removed Google Drive config-sync path. */
const REMOVED_PATHS = [
  "utils/google-drive",
  "hooks/use-google-drive-auth.ts",
  "utils/atoms/google-drive-sync.ts",
  "entrypoints/options/pages/preference/config/google-drive-sync",
]

/**
 * Tokens naming the removed Google Drive surface, under every spelling the
 * codebase uses. Matching is by substring, so `googleDrive` also covers the
 * `__googleDriveToken` storage key it used to persist.
 */
const GOOGLE_DRIVE_TOKENS = [
  "google-drive",
  "googleDrive",
  "GoogleDrive",
  "GOOGLE_DRIVE",
  "WXT_GOOGLE_CLIENT_ID",
]

/**
 * Google hosts the removed sync path talked to: the OAuth authorize page, the
 * token/userinfo endpoints, and the Drive content API.
 *
 * Deliberately narrow: Gemini (`generativelanguage.googleapis.com`) and Google
 * Translate (`translate.googleapis.com`, `translate-pa.googleapis.com`) are
 * translation providers, not the sync path, so they are not covered here.
 */
const GOOGLE_SYNC_ENDPOINTS = [
  "accounts.google.com",
  "oauth2.googleapis.com",
  "content.googleapis.com",
  "www.googleapis.com",
]

/**
 * Repo-root files that decide what the extension may reach and what a release
 * build requires. `src/` alone would miss them — the `identity` manifest
 * permission and the `.env.production` contract both live outside it.
 */
const REPO_CONFIG_FILES = ["wxt.config.ts", "package.json", "SOURCE_CODE_REVIEW.md"]

/**
 * The guard reads shipped sources only. Test files legitimately name these
 * tokens as negative fixtures ("this must never come back"), which is the
 * opposite of depending on them.
 */
function collectSourceFiles(dir: string, isRelevant: (name: string) => boolean): string[] {
  const files: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        continue
      }
      files.push(...collectSourceFiles(entryPath, isRelevant))
      continue
    }

    if (entry.isFile() && isRelevant(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

function readFiles(dir: string, isRelevant: (name: string) => boolean) {
  const files = new Map<string, string>()

  for (const file of collectSourceFiles(dir, isRelevant)) {
    files.set(file, readFileSync(file, "utf8"))
  }

  return files
}

const isTypeScript = (name: string) => /\.tsx?$/.test(name)
const isLocale = (name: string) => name.endsWith(".yml")

/** Walked once and reused: every assertion below reads the same snapshot. */
const SOURCES = readFiles(SRC_ROOT, isTypeScript)
const LOCALES = readFiles(path.join(SRC_ROOT, "locales"), isLocale)

/** Repo-root build/release config, scanned alongside `src/` so neither is blind. */
const REPO_CONFIGS = new Map(
  REPO_CONFIG_FILES.map((file) => [file, readFileSync(path.join(REPO_ROOT, file), "utf8")]),
)

function filesContaining(sources: Map<string, string>, token: string) {
  return [...sources].filter(([, source]) => source.includes(token)).map(([file]) => file)
}

/** Shipped code plus the root config that decides what a build may reach. */
function offendersOf(token: string) {
  return [...filesContaining(SOURCES, token), ...filesContaining(REPO_CONFIGS, token)]
}

describe("cloud sync surface", () => {
  it("ships no Google Drive sync module, hook, or atom", () => {
    for (const removed of REMOVED_PATHS) {
      expect(existsSync(path.join(SRC_ROOT, removed))).toBe(false)
    }
  })

  it("keeps every Google Drive token out of shipped source", () => {
    for (const token of GOOGLE_DRIVE_TOKENS) {
      expect(offendersOf(token)).toEqual([])
    }
  })

  it("makes no network call to the Google sync endpoints", () => {
    for (const endpoint of GOOGLE_SYNC_ENDPOINTS) {
      expect(offendersOf(endpoint)).toEqual([])
    }
  })

  it("carries no Google Drive entry in any locale", () => {
    for (const [locale, source] of LOCALES) {
      // Any spelling, at any nesting depth — not just a top-level `googleDrive:`
      // section, so a re-added `sync.googleDrive.title` key is caught too.
      expect(source, `${locale} still declares a googleDrive key`).not.toContain("googleDrive")
    }
  })

  it("asks no build, CI, or repo-root config for the Google client ID", () => {
    const files = [
      ".env.example",
      ".github/workflows/submit.yml",
      ".github/workflows/release.yml",
      ...REPO_CONFIG_FILES,
    ]

    for (const file of files) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8")
      expect(source, `${file} still references WXT_GOOGLE_CLIENT_ID`).not.toContain(
        "WXT_GOOGLE_CLIENT_ID",
      )
    }
  })

  it("requests no Google OAuth permission from the browser", () => {
    // `identity` existed only for browser.identity.getRedirectURL() in the
    // deleted OAuth flow; nothing in src/ calls browser.identity any more.
    const manifest = readFileSync(path.join(REPO_ROOT, "wxt.config.ts"), "utf8")
    expect(manifest).not.toContain('"identity"')
  })
})
