import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    setupFiles: ["./app/test/setup.ts"],
    environmentMatchGlobs: [
      ["**/*.component.test.tsx", "jsdom"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "json"],
      include: [
        "app/services/**/*.server.ts",
        "app/models/**/*.server.ts",
        "app/lib/**/*.server.ts",
        "app/lib/settings.ts",
        "app/routes/*.tsx",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/__tests__/**",
      ],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
});
