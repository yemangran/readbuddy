import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { selectFreshTranslateProviders } from "@/utils/config/default-translate-provider"
import { ensureInitializedConfig, isFreshInstalledConfig } from "../config"
import { setupInstallLifecycle } from "../install-lifecycle"

/**
 * Seam test for the extension install lifecycle (`runtime.onInstalled`).
 *
 * Everything the listener delegates to (config init, provider probing, cache eviction)
 * is replaced with spies, so the assertions only cover what the lifecycle does with the
 * browser tab API: installing must stay silent and open no tab.
 */
const { mockState, removeCacheGroupMock } = vi.hoisted(() => ({
  mockState: {
    isFreshInstalledConfig: false,
  },
  removeCacheGroupMock: vi.fn<(group: string) => void>(),
}))

type InstalledDetails = { reason?: string }

// fake-browser augments the WebExtension event with test-only helpers.
type FakeInstalledEvent = {
  trigger: (details: InstalledDetails) => Promise<unknown[]>
  removeAllListeners: () => void
  hasListeners: () => boolean
}
const installedEvent = browser.runtime.onInstalled as unknown as FakeInstalledEvent

vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
    debug: vi.fn<(...args: unknown[]) => void>(),
  },
}))

vi.mock("../config", () => ({
  ensureInitializedConfig: vi.fn<() => Promise<undefined>>(async () => undefined),
  isFreshInstalledConfig: vi.fn<() => Promise<boolean>>(
    async () => mockState.isFreshInstalledConfig,
  ),
}))

vi.mock("@/utils/config/default-translate-provider", () => ({
  selectFreshTranslateProviders: vi.fn<() => void>(),
}))

vi.mock("@/utils/session-cache/session-cache-group-registry", () => ({
  SessionCacheGroupRegistry: {
    removeCacheGroup: (group: string) => removeCacheGroupMock(group),
  },
}))

describe("setupInstallLifecycle", () => {
  let tabsCreate: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockState.isFreshInstalledConfig = false

    // fake-browser is a shared singleton: drop listeners other tests left behind.
    installedEvent.removeAllListeners()
    setupInstallLifecycle()
    tabsCreate = vi.spyOn(browser.tabs, "create").mockResolvedValue(undefined)
  })

  it("registers the install listener", () => {
    expect(installedEvent.hasListeners()).toBe(true)
  })

  it("opens no tab when the extension is installed", async () => {
    await installedEvent.trigger({ reason: "install" })

    // Positive control: the listener ran, so the tab assertion below is not vacuous.
    expect(vi.mocked(ensureInitializedConfig)).toHaveBeenCalledTimes(1)
    expect(tabsCreate).not.toHaveBeenCalled()
  })

  it("opens no tab for the other install reasons", async () => {
    await installedEvent.trigger({ reason: "install" })
    await installedEvent.trigger({ reason: "update" })
    await installedEvent.trigger({ reason: "chrome_update" })

    expect(tabsCreate).not.toHaveBeenCalled()
  })

  it("still probes providers when the config comes from defaults", async () => {
    mockState.isFreshInstalledConfig = true
    expect(vi.mocked(isFreshInstalledConfig)).not.toHaveBeenCalled()

    await installedEvent.trigger({ reason: "install" })

    expect(vi.mocked(selectFreshTranslateProviders)).toHaveBeenCalledTimes(1)
    expect(tabsCreate).not.toHaveBeenCalled()
  })

  it("still clears the blog cache when the extension is updated", async () => {
    await installedEvent.trigger({ reason: "update" })

    expect(removeCacheGroupMock).toHaveBeenCalledWith("blog-fetch")
  })
})
