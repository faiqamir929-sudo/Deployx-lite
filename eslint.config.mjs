import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * The root lint command covers checked-in application, library, and build
 * configuration source. Generated API clients, build output, and the mockup
 * artifact are not maintained source and are excluded from this check.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.d.ts",
      ".agents/**",
      ".local/**",
      "artifacts/mockup-sandbox/**",
      "lib/api-client-react/src/generated/**",
      "lib/api-zod/src/generated/**",
      "lib/integrations/openai_ai_integrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "**/*.ts",
      "**/*.tsx",
      "**/*.mts",
      "**/*.cts",
      "**/*.mjs",
    ],
    rules: {
      // TypeScript performs this check more accurately than ESLint's
      // no-undef rule, especially for browser and Node globals.
      "no-undef": "off",
      // A few API-client boundaries require deliberate casts to generated
      // contract types. Keep those casts visible to review without making the
      // maintained source impossible to lint.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: "readonly",
        Buffer: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        globalThis: "readonly",
        process: "readonly",
        registerProcessor: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
      },
    },
  },
);