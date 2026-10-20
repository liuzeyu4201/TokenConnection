import { generateText } from "ai";

import { parseFollowUpModelText } from "@/lib/followups/plan";

import { getExtractionModel } from "./provider";

export const FOLLOW_UP_SYSTEM_PROMPT = `你帮人写回访提醒。对方刚被记进私人通讯录。请按固定顺序写四句中文建议，对应：第2天、第3天、1周后、1个月后。

每句 12 到 40 个字，具体、可执行，例如发一条消息、问近况、接着认识时的话题约一次。
只根据用户给出的「怎么认识的」和「摘要」。没有的信息不要编。
不要写电话、微信、邮箱、链接。句子里不要再写「第2天」这类时点。
只输出这一段 JSON，不要解释，不要用代码块：
{"suggestions":["第2天的一句","第3天的一句","1周后的一句","1个月后的一句"]}`;

export const FOLLOW_UP_TIMEOUT_MS = 12_000;

export async function generateFollowUpSuggestions(userPrompt: string): Promise<unknown> {
  const result = await generateText({
    model: getExtractionModel(),
    system: FOLLOW_UP_SYSTEM_PROMPT,
    prompt: userPrompt,
    temperature: 0.3,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(FOLLOW_UP_TIMEOUT_MS),
  });
  return parseFollowUpModelText(result.text);
}
