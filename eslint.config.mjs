import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import nPlugin from "eslint-plugin-n";

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.squad/**"],
  },

  // Source packages — type-aware rules enabled via tsconfig project service
  {
    files: ["packages/**/*.ts", "packages/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      n: nPlugin,
    },
    rules: {
      // Catch fire-and-forget promises and missing awaits
      "@typescript-eslint/no-floating-promises": "warn",

      // Flag synchronous I/O inside functions (allowAtRootLevel
      // permits sync calls in module-level config/setup code)
      "n/no-sync": ["warn", { allowAtRootLevel: true }],

      // Prevent console.log in production; allow warn/error
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Test files — no tsconfig coverage, so only non-type-aware rules
  {
    files: ["test/**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
