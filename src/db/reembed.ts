import { loadDotEnv } from "./load-env";

loadDotEnv();

/**
 * Recompute every person's embedding with the current provider, e.g. after
 * switching from mock to real or changing the embedding model.
 *
 *   pnpm db:reembed
 */
async function main() {
  const { closeDb } = await import("./index");
  const { reembedAllPeople } = await import("@/lib/llm/embed");
  const { getEmbeddingModelName, getLlmProviderKind } = await import("@/lib/llm/provider");

  console.log(`LLM provider: ${getLlmProviderKind()}（embedding 模型 ${getEmbeddingModelName()}）`);
  const result = await reembedAllPeople();
  console.log(`完成：${result.total} 人，失败 ${result.failed.length} 个。`);
  if (result.failed.length > 0) console.log(result.failed.join("\n"));
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
