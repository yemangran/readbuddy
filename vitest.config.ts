import ViteYaml from "@modyfi/vite-plugin-yaml"
import react from "@vitejs/plugin-react"
import { configDefaults, defineConfig } from "vitest/config"
import { WxtVitest } from "wxt/testing/vitest-plugin"

export default defineConfig({
  // TODO: remove any
  // ViteYaml lets tests import the bundled locale resources (src/locales/*.yml)
  // as JS objects, the same transform the main build registers in wxt.config.ts.
  // The global i18n mocks in vitest.setup.ts stay in place for every other test;
  // locale-boundary.test.tsx opts out of them via vi.unmock.
  plugins: [WxtVitest() as any, react(), ViteYaml()],
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**", "**/repos/**"],
    environment: "node",
    environmentOptions: {
      // jsdom defaults to http://localhost:3000/, which built-in site rules
      // keyed on localhost (e.g. sillytavern) silently match — tests written
      // on the default URL would run under that site's semantics instead of
      // the shipped defaults. Pin a neutral host no rule matches; per-file
      // @vitest-environment-options pragmas still override this.
      jsdom: { url: "https://neutral-test.example/" },
    },
    globals: true,
    setupFiles: "vitest.setup.ts",
    watch: false,
    coverage: {
      provider: "istanbul",
      reporter: ["text", "html", "lcov"],
      // include: ['src/**/*.{ts,tsx}'],
      // exclude: ['src/**/*.spec.ts']
    },
  },
})
