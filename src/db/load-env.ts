import fs from "node:fs";
import path from "node:path";

/**
 * Load `.env` from the project root into process.env for standalone scripts
 * (migrate, seed, reembed, drizzle-kit). Next.js loads `.env` on its own, so
 * this module is intentionally never imported by app code. Existing variables
 * are never overwritten.
 */
export function loadDotEnv(file = ".env"): void {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  try {
    process.loadEnvFile(full);
  } catch {
    // ignore: malformed file or unsupported runtime
  }
}
