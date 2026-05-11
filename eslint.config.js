import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-config-prettier";
import solid from "eslint-plugin-solid";

export default [
  {
    ignores: [
      ".output/**",
      ".nitro/**",
      "dist/**",
      "node_modules/**",
      "*.log",
      "*.lock",
      "pnpm-lock.yaml",
      "bun.lock",
      "app.config.timestamp_*",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      solid,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  prettier,
];
