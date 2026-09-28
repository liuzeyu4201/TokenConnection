import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import {
  getDeepSeekConfig,
  getEmbeddingConfig,
  getEmbeddingModelId,
  getLlmProviderKind,
} from "@/lib/env";

import { MOCK_EMBEDDING_MODEL } from "./mock";

/**
 * Two OpenAI-compatible providers (design.md §13):
 * - deepseek: chat model for extraction / intent detection
 * - embedding: any OpenAI-compatible /embeddings endpoint (default SiliconFlow
 *   serving Qwen3-VL-Embedding-8B, truncated to EMBEDDING_DIM via `dimensions`)
 * Both are created lazily so the mock provider never needs API keys.
 */

export { getLlmProviderKind };

export function isMockProvider(): boolean {
  return getLlmProviderKind() === "mock";
}

export function getExtractionModel() {
  const config = getDeepSeekConfig();
  const deepseek = createOpenAICompatible({
    name: "deepseek",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    // DeepSeek has no strict structured-output support: the SDK falls back to
    // `response_format: { type: "json_object" }` and injects the schema into
    // the prompt, i.e. the "json mode" from the design doc.
    supportsStructuredOutputs: false,
  });
  return deepseek.chatModel(config.model);
}

export function getEmbeddingModel() {
  const config = getEmbeddingConfig();
  const provider = createOpenAICompatible({
    name: "embedding",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
  return provider.embeddingModel(config.model);
}

/** Stored in people_embeddings.model to detect vectors from older models. */
export function getEmbeddingModelName(): string {
  if (isMockProvider()) return MOCK_EMBEDDING_MODEL;
  return getEmbeddingModelId();
}
