import { defineConfig } from "drizzle-kit";

import { loadDotEnv } from "./src/db/load-env";

loadDotEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:tokenconnection@localhost:5433/tokenconnection",
  },
  strict: true,
  verbose: true,
});
