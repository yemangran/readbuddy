import { z } from "zod"

type RawEnvValue = string | boolean | undefined
export type RawExtensionEnv = Record<string, RawEnvValue>

const rawBooleanSchema = z
  .union([z.stringbool({ truthy: ["true"], falsy: ["false"] }), z.boolean()])
  .optional()

const strictStringSchema = z.string().refine((value) => value === value.trim(), {
  message: "must not include leading or trailing whitespace",
})

const strictUrlSchema = strictStringSchema.pipe(z.url()).refine((value) => !value.endsWith("/"), {
  message: "must not end with a trailing slash",
})

const optionalNonEmptyStringSchema = z.string().min(1).optional()
const optionalStrictUrlSchema = strictUrlSchema.optional()

export function isLocalPackagesEnabled(rawEnv: RawExtensionEnv) {
  return rawBooleanSchema.parse(rawEnv.WXT_USE_LOCAL_PACKAGES) ?? false
}

/**
 * The extension's own environment surface.
 *
 * It deliberately holds no upstream endpoint, website, or authorization-cookie
 * vars: the extension is local-first, so nothing here may point at a remote
 * host it does not need. Analytics (PostHog) stays opt-in and configurable.
 */
export function createExtensionClientEnvSchema(isProd: boolean, skipRequiredProductionEnv = false) {
  const requiresProductionEnv = isProd && !skipRequiredProductionEnv

  return {
    WXT_POSTHOG_HOST: requiresProductionEnv ? strictUrlSchema : optionalStrictUrlSchema,
    WXT_POSTHOG_API_KEY: requiresProductionEnv ? z.string().min(1) : optionalNonEmptyStringSchema,
    WXT_POSTHOG_TEST_UUID: optionalNonEmptyStringSchema,
    WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: rawBooleanSchema.default(false),
  } satisfies Record<string, z.ZodType>
}
