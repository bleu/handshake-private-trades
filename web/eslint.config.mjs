import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const publicModules = [
  {
    group: [
      "@/domain/orders/*",
      "**/domain/orders/*",
      "!**/domain/orders/index.ts",
    ],
    message: "Use the public order module export.",
  },
  {
    group: ["@/infrastructure/storage/*", "**/infrastructure/storage/*"],
    message: "Use the public storage adapter export.",
  },
];

export default defineConfig([
  ...nextVitals,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "import/no-cycle": "error",
      "no-restricted-imports": ["error", { patterns: publicModules }],
      "import/no-restricted-paths": [
        "error",
        {
          basePath: import.meta.dirname,
          zones: [
            {
              target: "./src/domain",
              from: [
                "./src/app",
                "./src/features",
                "./src/infrastructure",
                "./src/components",
                "./src/config",
                "./src/generated",
              ],
              message:
                "Domain modules must remain independent of application code.",
            },
            {
              target: "./src/components/ui",
              from: "./src/features",
              message: "Shared UI cannot depend on features.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "localStorage",
        "fetch",
        "navigator",
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...publicModules,
            {
              group: [
                "react",
                "react/*",
                "next",
                "next/*",
                "wagmi",
                "wagmi/*",
                "swr",
                "swr/*",
                "**/app/**",
                "**/features/**",
                "**/infrastructure/**",
                "**/components/**",
                "**/config/**",
                "**/generated/**",
              ],
              message:
                "Domain modules are pure and independent of application code.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "next-env.d.ts", "src/generated/**"]),
]);
