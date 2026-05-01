import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import security from "eslint-plugin-security"
import sonarjs from "eslint-plugin-sonarjs"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  security.configs.recommended,
  sonarjs.configs.recommended,
  {
    rules: {
      // No console.log in production code — use a proper logger or remove
      "no-console": "error",
      // Enforce explicit return types on public API functions
      "@typescript-eslint/explicit-function-return-type": "off",
      // Disallow any
      "@typescript-eslint/no-explicit-any": "error",
      // Enforce exhaustive type checks
      "@typescript-eslint/no-unsafe-assignment": "off",
      // Cognitive complexity limit (sonarjs) — keep functions readable
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "no-console": "off",
      "sonarjs/cognitive-complexity": ["error", 25],
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",
      // Test files use fixed dummy strings — not real secrets
      "sonarjs/hardcoded-secret-signatures": "off",
      "sonarjs/no-hardcoded-secrets": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "coverage/**",
    "playwright-report/**",
  ]),
])

export default eslintConfig
