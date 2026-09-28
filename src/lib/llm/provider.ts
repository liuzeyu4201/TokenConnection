import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { getDashScopeConfig, getDeepSeekConfig, getLlmProviderKind } from "@/lib/env";

import { MOCK_EMBEDDING_MODEL } from "./mock";

/**
 * Two OpenAI-compatible providers (design.md §13):
 * - deepseek: chat model for extraction / intent detection
 * - dashscope: Qwen text-embedding-v3 for embeddings
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
  const config = getDashScopeConfig();
  const dashscope = createOpenAICompatible({
    name: "dashscope",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
  return dashscope.embeddingModel(config.model);
}

/** Stored in people_embeddings.model to detect vectors from older models. */
export function getEmbeddingModelName(): string {
  if (isMockProvider()) return MOCK_EMBEDDING_MODEL;
  return process.env.DASHSCOPE_EMBEDDING_MODEL || "text-embedding-v3";
}
