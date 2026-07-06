import eslint from "@eslint/js";
import typescriptEslint from "typescript-eslint";

const typedTypeScriptConfigs =
  typescriptEslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  }));

export default typescriptEslint.config(
  {
    ignores: [
      ".cache/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "*.tsbuildinfo",
    ],
  },
  {
    ...eslint.configs.recommended,
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  ...typedTypeScriptConfigs,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "no-console": "error",
    },
  },
);
