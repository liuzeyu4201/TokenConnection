import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/lib/services/**/*.ts"],
    ignores: ["src/lib/services/db-client.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@/db", message: "服务层只能通过 withTenant 拿到数据库句柄。" }],
        },
      ],
    },
  },
]);

export default eslintConfig;
