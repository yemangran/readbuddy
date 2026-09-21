import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createExtensionClientEnvSchema, isLocalPackagesEnabled } from "../shared"

const PRODUCTION_REQUIRED_ENV = {
  WXT_POSTHOG_HOST: "https://us.i.posthog.com",
  WXT_POSTHOG_API_KEY: "phc_test",
} as const

// Every var the extension still reads from the environment. Anything outside
// this list must not survive parsing, so a removed upstream var cannot linger
// as a silent fallback.
const SUPPORTED_ENV_VARS = [
  "WXT_POSTHOG_HOST",
  "WXT_POSTHOG_API_KEY",
  "WXT_POSTHOG_TEST_UUID",
  "WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED",
] as const

const UPSTREAM_ENV_VARS = [
  "WXT_API_URL",
  "WXT_WEBSITE_URL",
  "WXT_OFFICIAL_SITE_ORIGINS",
  "WXT_AUTH_COOKIE_DOMAINS",
] as const

function parseExtensionEnv(
  rawEnv: Record<string, string | boolean | undefined>,
  isProd = false,
  skipRequiredProductionEnv = false,
) {
  return z.object(createExtensionClientEnvSchema(isProd, skipRequiredProductionEnv)).parse(rawEnv)
}

describe("extension env schema", () => {
  it("declares only the vars the extension still reads", () => {
    expect(Object.keys(createExtensionClientEnvSchema(false)).sort()).toEqual(
      [...SUPPORTED_ENV_VARS].sort(),
    )
  })

  it("carries no upstream website, api, or cookie authorization defaults", () => {
    // The upstream domains used to be baked in as production/localhost
    // defaults, so a build without a .env file still talked to them.
    for (const upstreamVar of UPSTREAM_ENV_VARS) {
      expect(Object.keys(createExtensionClientEnvSchema(false))).not.toContain(upstreamVar)
    }
  })

  it("drops leftover upstream env vars instead of falling back to them", () => {
    const parsed = parseExtensionEnv({
      WXT_API_URL: "https://api.readfrog.app",
      WXT_WEBSITE_URL: "https://www.readfrog.app",
      WXT_OFFICIAL_SITE_ORIGINS: "https://readfrog.app,https://www.readfrog.app",
      WXT_AUTH_COOKIE_DOMAINS: "readfrog.app",
    })

    for (const upstreamVar of UPSTREAM_ENV_VARS) {
      expect(parsed).not.toHaveProperty(upstreamVar)
    }
  })
})

describe("extension env parsing", () => {
  it("keeps optional analytics vars optional outside production", () => {
    expect(parseExtensionEnv({})).toEqual({
      WXT_POSTHOG_HOST: undefined,
      WXT_POSTHOG_API_KEY: undefined,
      WXT_POSTHOG_TEST_UUID: undefined,
      WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: false,
    })
  })

  it("requires PostHog env vars when PROD is true", () => {
    expect(() =>
      parseExtensionEnv(
        {
          WXT_POSTHOG_HOST: "https://us.i.posthog.com",
        },
        true,
      ),
    ).toThrowError("expected string, received undefined")
  })

  it("accepts PostHog env vars when PROD is true", () => {
    expect(parseExtensionEnv({ ...PRODUCTION_REQUIRED_ENV }, true)).toEqual({
      WXT_POSTHOG_HOST: PRODUCTION_REQUIRED_ENV.WXT_POSTHOG_HOST,
      WXT_POSTHOG_API_KEY: PRODUCTION_REQUIRED_ENV.WXT_POSTHOG_API_KEY,
      WXT_POSTHOG_TEST_UUID: undefined,
      WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: false,
    })
  })

  it("lets production parsing skip only the required PostHog env vars", () => {
    expect(parseExtensionEnv({}, true, true)).toEqual({
      WXT_POSTHOG_HOST: undefined,
      WXT_POSTHOG_API_KEY: undefined,
      WXT_POSTHOG_TEST_UUID: undefined,
      WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: false,
    })
  })

  it("parses WXT_USE_LOCAL_PACKAGES strictly with zod stringbool", () => {
    expect(isLocalPackagesEnabled({ WXT_USE_LOCAL_PACKAGES: true })).toBe(true)
    expect(isLocalPackagesEnabled({ WXT_USE_LOCAL_PACKAGES: "true" })).toBe(true)
    expect(isLocalPackagesEnabled({})).toBe(false)
    expect(() => isLocalPackagesEnabled({ WXT_USE_LOCAL_PACKAGES: "yes" })).toThrowError(/Invalid/)
  })

  it("parses the analytics daily feature cache flag strictly", () => {
    expect(
      parseExtensionEnv({ WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: "true" })
        .WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED,
    ).toBe(true)
    expect(
      parseExtensionEnv({ WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: "false" })
        .WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED,
    ).toBe(false)
    expect(() =>
      parseExtensionEnv({ WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: "yes" }),
    ).toThrowError(/Invalid/)
  })
})
