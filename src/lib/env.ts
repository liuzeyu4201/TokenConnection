import fs from "node:fs";
import path from "node:path";

/**
 * Load `.env` from the project root into process.env for standalone scripts
 * (migrate, seed, drizzle-kit). Next.js loads `.env` on its own, so calling
 * this inside the app is a no-op in practice. Existing variables are never
 * overwritten.
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

export type LlmProviderKind = "mock" | "real";

export const EMBEDDING_DIM = 1024;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function getDatabaseUrl(): string {
  return required("DATABASE_URL");
}

export function getApiToken(): string | undefined {
  return process.env.API_TOKEN || undefined;
}

export function getLlmProviderKind(): LlmProviderKind {
  const raw = (process.env.LLM_PROVIDER ?? "mock").trim().toLowerCase();
  if (raw === "real" || raw === "deepseek" || raw === "live") return "real";
  return "mock";
}

export function getDeepSeekConfig() {
  return {
    apiKey: required("DEEPSEEK_API_KEY"),
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
  };
}

export function getDashScopeConfig() {
  const dim = Number(process.env.EMBEDDING_DIM || EMBEDDING_DIM);
  if (dim !== EMBEDDING_DIM) {
    throw new Error(
      `EMBEDDING_DIM must be ${EMBEDDING_DIM} to match the people_embeddings.embedding column`,
    );
  }
  return {
    apiKey: required("DASHSCOPE_API_KEY"),
    model: process.env.DASHSCOPE_EMBEDDING_MODEL || "text-embedding-v3",
    baseURL:
      process.env.DASHSCOPE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    dimensions: dim,
  };
}
