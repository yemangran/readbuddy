import path from "node:path"
import process from "node:process"
import ViteYaml from "@modyfi/vite-plugin-yaml"
import { defineConfig } from "wxt"
import { z } from "zod"
import {
  createExtensionClientEnvSchema,
  isLocalPackagesEnabled,
  resolveExtensionEnv,
} from "./src/env/shared"

const WXT_API_KEY_PATTERN = /^WXT_.*API_KEY/
const ALLOWED_BUNDLED_API_KEYS = new Set(["WXT_POSTHOG_API_KEY"])
const useLocalPackages = isLocalPackagesEnabled(process.env)
const shouldSkipEnvValidation = process.env.WXT_SKIP_ENV_VALIDATION === "true"
// Root of the read-frog monorepo whose source is aliased in when developing
// with local packages. Defaults to the sibling checkout; override with
// WXT_MONOREPO_PATH to point at a git worktree (relative or absolute).
const monorepoRoot = process.env.WXT_MONOREPO_PATH
  ? path.resolve(process.env.WXT_MONOREPO_PATH)
  : path.resolve(__dirname, "../read-frog-monorepo")

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  imports: false,
  modules: ["@wxt-dev/module-react", "@wxt-dev/i18n/module"],
  manifestVersion: 3,
  // WXT top level alias - will be automatically synced to tsconfig.json paths and Vite alias
  alias: useLocalPackages
    ? {
        "@read-frog/definitions": path.resolve(monorepoRoot, "packages/definitions/src"),
        "@read-frog/api-contract": path.resolve(monorepoRoot, "packages/api-contract/src"),
      }
    : {},
  manifest: ({ mode, browser }) => ({
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    // Fixed extension ID for development
    ...(mode === "development" &&
      (browser === "chrome" || browser === "edge") && {
        key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArRfHO7qBC1ZztQWfpofqOXnvN1Xxl/QhCPwTLXwT7qNX1l4XAsK07UBZCFK9BxhrndyzXpxugUU4uBegp3w9xdmmm/rpjci1HYB/mBYYqR/i/ThmjtdtsxWKmY9XH/Qt4/yzHlCG0bJ/5luRVxYTEEyL8jlA//B2C9O3Xs26tfU06+7U0TD3NgcN46dai0OXidnr8pYXsL+uGKuNdegcsakE5e4m+EmRNtILsQ9P8xNYHqr2M8FJ+mTR7K13YilBsCdq/n8s60V/KOn0AQV8F5DO91k/SVc4lRcmSFWHOlDo+sRzevI7eMNwcOmpmj7nPnPAIC1kF83i0ILtKehPsQIDAQAB",
      }),
    permissions: [
      "storage",
      "tabs",
      "alarms",
      "cookies",
      "contextMenus",
      "identity",
      "scripting",
      "webNavigation",
      ...(browser !== "firefox" ? ["offscreen", "sidePanel"] : []),
    ],
    host_permissions: [
      "*://*/*", // Required for scripting.executeScript in any frame
    ],
    // Allow images/SVGs referenced by content-script UI <img> tags to be loaded from
    // moz-extension:// URLs on regular pages. Firefox enforces this more strictly.
    web_accessible_resources: [
      {
        resources: ["assets/*.png", "assets/*.svg", "assets/*.webp"],
        matches: ["*://*/*", "file:///*"],
      },
    ],
    // Firefox-specific settings for MV3
    ...(browser === "firefox" && {
      // Override default CSP to exclude `upgrade-insecure-requests` (Firefox MV3 default),
      // which would upgrade custom provider HTTP URLs (e.g. LAN) to HTTPS.
      content_security_policy: {
        extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      },
      browser_specific_settings: {
        gecko: {
          id: "{10c5c023-61f8-493e-91e3-f253a41ab291}",
          strict_min_version: "112.0",
          data_collection_permissions: {
            required: ["none"],
            optional: ["technicalAndInteraction"],
          },
        },
      },
    }),
  }),
  zip: {
    includeSources: ["**/*", ".env.production"],
    excludeSources: ["docs/**/*", "assets/**/*", "repos/**/*", "readmes/**/*"],
  },
  hooks: {
    "vite:build:extendConfig": (entrypoints, viteConfig) => {
      const entrypoint = entrypoints.length === 1 ? entrypoints[0] : undefined
      if (entrypoint?.type !== "content-script") return

      const output = viteConfig.build?.rollupOptions?.output
      if (!output) return

      for (const outputOptions of Array.isArray(output) ? output : [output]) {
        outputOptions.assetFileNames = (assetInfo) =>
          assetInfo.names.some((name) => name.endsWith(".css"))
            ? `content-scripts/${entrypoint.name}.[ext]`
            : "assets/[name]-[hash].[ext]"
      }
    },
  },
  dev: {
    server: {
      // Prefer 3333 over WXT's default 3000 while still allowing WXT to pick
      // another open port when 3333 is already taken.
      port: 3333,
      strictPort: false,
    },
  },
  vite: (configEnv) => ({
    resolve: {
      // CodeMirror breaks with "Unrecognized extension value in extension set"
      // if the bundle contains more than one copy of these packages (#1782).
      dedupe: [
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/autocomplete",
        "@codemirror/search",
        "@codemirror/commands",
        "@lezer/common",
      ],
    },
    plugins: [
      // Lets the runtime i18next facade (src/utils/i18n) `import` the `src/locales/*.yml`
      // files as JS objects so i18next can bundle them for runtime language switching.
      //
      // This does NOT replace `@wxt-dev/i18n/module` (still registered in `modules` above).
      // That module reads the same .yml files via its own fs-based mechanism — a separate
      // path from this Vite `import` — and is kept ONLY for two build-time jobs it still owns:
      //   1. Emitting `_locales/*/messages.json`, which the browser uses to localize the
      //      manifest `__MSG_extName__` / `__MSG_extDescription__` below. That is chosen by
      //      the browser UI language at load time and is NOT runtime-switchable (platform
      //      constraint), so it stays with @wxt-dev/i18n.
      //   2. Generating the `#i18n` key types (.wxt/i18n/structure.d.ts) that the facade
      //      reuses for autocomplete/type-checking at every `i18n.t('key')` call site.
      // Runtime UI string lookup itself no longer goes through @wxt-dev/i18n.
      ViteYaml(),
      ...(configEnv.mode === "production"
        ? [
            {
              name: "check-api-key-env",
              buildStart() {
                z.object(
                  createExtensionClientEnvSchema(
                    configEnv.mode === "production",
                    shouldSkipEnvValidation,
                  ),
                ).parse(resolveExtensionEnv(process.env))

                const apiKeyVars = Object.keys(process.env)
                  .filter((key) => WXT_API_KEY_PATTERN.test(key))
                  .filter((key) => !ALLOWED_BUNDLED_API_KEYS.has(key))

                if (apiKeyVars.length > 0) {
                  throw new Error(
                    `\n\nFound WXT_*_API_KEY environment variables that may be bundled:\n` +
                      `${apiKeyVars.map((k) => `   - ${k}`).join("\n")}\n\n` +
                      `Please unset these variables before building for production.\n`,
                  )
                }
              },
            },
          ]
        : []),
    ],
  }),
})
