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
        // Next.js pages, layouts, error boundaries — tested via E2E
        "src/app/**",
        // shadcn/ui generated components
        "src/components/ui/**",
        // Browser-API-heavy recording components — tested via E2E
        "src/components/recording/**",
        // Infrastructure clients — thin wrappers, no logic to test
        "src/lib/supabase/**",
        // STT adapter implementations — tested indirectly via route mocks
        "src/lib/stt/openai.ts",
        "src/lib/stt/sarvam.ts",
        "src/lib/stt/elevenlabs.ts",
        "src/lib/stt/types.ts",
        // Next.js middleware — tested via E2E; auth flow depends on real Supabase
        "src/middleware.ts",
        // Static config — no logic
        "src/config/**",
        // Inngest job functions — require Inngest runtime; tested via E2E/integration
        "src/lib/inngest/**",
        "src/inngest/**",
        "**/*.d.ts",
        "src/types/**",
        "*.config.*",
        ".next/**",
        "node_modules/**",
        "tests/**",
        ".pnpmfile.cjs",
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
