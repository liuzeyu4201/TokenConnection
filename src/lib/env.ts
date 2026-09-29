/**
 * Typed access to environment variables. Everything is read lazily so that
 * importing this module never throws (tests, `next build`). Standalone scripts
 * load `.env` via src/db/load-env.ts first.
 */

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

export const DEFAULT_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-4B";
export const DEFAULT_EMBEDDING_BASE_URL = "https://api.siliconflow.cn/v1";

/**
 * Any OpenAI-compatible `/embeddings` endpoint. Default is SiliconFlow serving
 * Qwen3-Embedding-4B, whose native 2560 dims are truncated server-side to
 * EMBEDDING_DIM via the `dimensions` parameter (Matryoshka embeddings).
 * Qwen3-VL-Embedding-8B was tried first and scored near random on the
 * templated person text (top-1 2/6 vs 5/6 for the text models).
 */
export function getEmbeddingConfig() {
  const dim = Number(process.env.EMBEDDING_DIM || EMBEDDING_DIM);
  if (dim !== EMBEDDING_DIM) {
    throw new Error(
      `EMBEDDING_DIM must be ${EMBEDDING_DIM} to match the people_embeddings.embedding column`,
    );
  }
  return {
    apiKey: required("EMBEDDING_API_KEY"),
    model: getEmbeddingModelId(),
    baseURL: process.env.EMBEDDING_BASE_URL || DEFAULT_EMBEDDING_BASE_URL,
    dimensions: dim,
  };
}

export function getEmbeddingModelId(): string {
  return process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

export const DEFAULT_VISION_MODEL = "Qwen/Qwen3-VL-8B-Instruct";

/**
 * Vision chat for reading cards and screenshots. Defaults to the same
 * SiliconFlow key and base URL as embeddings; DeepSeek's chat model has no
 * image input.
 */
export function getVisionConfig() {
  const apiKey = process.env.VISION_API_KEY || process.env.EMBEDDING_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required environment variable VISION_API_KEY or EMBEDDING_API_KEY");
  }
  return {
    apiKey,
    model: process.env.VISION_MODEL || DEFAULT_VISION_MODEL,
    baseURL: process.env.VISION_BASE_URL || process.env.EMBEDDING_BASE_URL || DEFAULT_EMBEDDING_BASE_URL,
  };
}
