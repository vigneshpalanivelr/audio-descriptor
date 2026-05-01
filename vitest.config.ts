import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
      exclude: [
        "src/app/**",
        "src/components/ui/**",
        "**/*.d.ts",
        "src/types/**",
        "*.config.*",
        ".next/**",
        "node_modules/**",
        "tests/**",
        "src/inngest/client.ts",
      ],
    },
    // Vitest 3 workspace-style projects
    projects: [
      {
        plugins: [react(), tsconfigPaths()],
        test: {
          name: "unit",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/unit/**/*.test.{ts,tsx}"],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "integration",
          globals: true,
          environment: "node",
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/integration/**/*.test.ts"],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "security",
          globals: true,
          environment: "node",
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/security/**/*.test.ts"],
        },
      },
    ],
  },
})
