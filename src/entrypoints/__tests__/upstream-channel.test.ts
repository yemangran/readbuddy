import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * Security boundary guard for the extension's content scripts.
 *
 * The extension used to inject a privileged content script into the upstream
 * website: that page could postMessage the extension to read its pin state,
 * rewrite the user's target language in stored config, and track onboarding
 * progress. It also bridged selections out of the upstream ebook reader. Both
 * channels are gone, and this guard keeps them from coming back — a foreign
 * page must never be able to inspect or mutate extension state again.
 *
 * See docs/specs/remove-upstream-website-links.md.
 */

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url))

/** Env vars that used to point the extension at the upstream website/API. */
const UPSTREAM_ENV_TOKENS = [
  "WXT_API_URL",
  "WXT_WEBSITE_URL",
  "WXT_OFFICIAL_SITE_ORIGINS",
  "WXT_AUTH_COOKIE_DOMAINS",
]

/** The upstream commercial website, under whatever name it is spelled. */
const UPSTREAM_DOMAIN = "readfrog.app"

/** postMessage protocol of the removed upstream guide channel. */
const GUIDE_CHANNEL_TOKENS = [
  "read-frog-page",
  "guideDictionaryNotebase",
  "pinStateChanged",
  "getPinState",
]

/** Identifiers of the removed upstream ebook-reader selection bridge. */
const EBOOK_BRIDGE_TOKENS = ["EBOOK_BRIDGE", "EbookBridge", "EXTERNAL_SELECTION"]

/**
 * The guard reads shipped sources only. Test files legitimately name these
 * tokens as negative fixtures ("this URL must never be opened"), which is the
 * opposite of depending on them.
 */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Locales carry upstream domain names as user-facing copy, not endpoints.
      if (entry.name === "locales" || entry.name === "__tests__") {
        continue
      }
      files.push(...collectSourceFiles(entryPath))
      continue
    }

    if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

function readSources() {
  const sources = new Map<string, string>()

  for (const file of collectSourceFiles(SRC_ROOT)) {
    sources.set(file, readFileSync(file, "utf8"))
  }

  return sources
}

function filesContaining(sources: Map<string, string>, token: string) {
  return [...sources].filter(([, source]) => source.includes(token)).map(([file]) => file)
}

describe("content script upstream boundary", () => {
  it("injects no content script into the upstream website", () => {
    // The guide content script matched the upstream origins only; without it no
    // page outside the user's control can talk to the extension.
    expect(existsSync(path.join(SRC_ROOT, "entrypoints/guide.content"))).toBe(false)
  })

  it("keeps upstream endpoint env vars out of the source tree", () => {
    const sources = readSources()

    for (const token of UPSTREAM_ENV_TOKENS) {
      expect(filesContaining(sources, token)).toEqual([])
    }
  })

  it("keeps the upstream website domain out of shipped source", () => {
    // Catches an upstream endpoint reintroduced under a brand new variable or
    // constant name, which a name-based token list alone would miss.
    expect(filesContaining(readSources(), UPSTREAM_DOMAIN)).toEqual([])
  })

  it("keeps the privileged guide postMessage channel out of the source tree", () => {
    const sources = readSources()

    for (const token of GUIDE_CHANNEL_TOKENS) {
      expect(filesContaining(sources, token)).toEqual([])
    }
  })

  it("keeps the upstream ebook selection bridge out of the source tree", () => {
    const sources = readSources()

    for (const token of EBOOK_BRIDGE_TOKENS) {
      expect(filesContaining(sources, token)).toEqual([])
    }
  })
})
