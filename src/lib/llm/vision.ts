import { generateText } from "ai";

import { getVisionConfig } from "@/lib/env";

import { isMockProvider, getVisionModel } from "./provider";
import { ExtractionError } from "./types";

export const VISION_TIMEOUT_MS = 40_000;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export type ImagePayload = {
  bytes: Uint8Array;
  mediaType: ImageMediaType;
};

const VISION_PROMPT = `请阅读这张图片。它可能是名片、微信或聊天截图、活动照片、手写笔记。
用简体中文列出你能确定看到的事实，包括：姓名或称呼、性别线索、城市、职业或能力、联系方式原文（微信号、手机号、邮箱）、认识场景、对人的印象。
看不清的不要编。不要输出 JSON。`;

export function isImageMediaType(value: string): value is ImageMediaType {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

/** Throws a plain Error with a user-facing message when the file cannot be read. */
export function validateImage(file: { mediaType: string; size: number }): ImageMediaType {
  if (!isImageMediaType(file.mediaType)) {
    throw new Error("只支持 jpg、png、webp、gif 图片");
  }
  if (file.size <= 0) throw new Error("图片是空的");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("图片不能超过 4MB");
  return file.mediaType;
}

/**
 * Join the user's sentence with what the vision model read. A leading
 * `+` / `?` on the user's text stays at the start so prefix rules still apply.
 */
export function composeImageText(userText: string, caption: string | null): string {
  const user = userText.trim();
  const seen = caption?.trim() ?? "";
  if (user && seen) return `${user}\n图片里看到：${seen}`;
  if (seen) return `图片里看到：${seen}`;
  return user;
}

/** Read an image into plain Chinese facts. Mock mode does not look at the pixels. */
export async function describeImage(image: ImagePayload): Promise<string> {
  if (isMockProvider()) {
    return "（mock 模式没有真正识别画面，请在文字里补充这个人是谁）";
  }

  try {
    const result = await generateText({
      model: getVisionModel(),
      temperature: 0,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "file", mediaType: image.mediaType, data: image.bytes },
          ],
        },
      ],
    });
    const text = result.text.trim();
    if (!text) throw new ExtractionError("图片里没有读出文字");
    return text;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    const model = getVisionConfig().model;
    const message = error instanceof Error ? error.message : "图片识别失败";
    throw new ExtractionError(`${model} 没能读这张图片：${message}`, { cause: error });
  }
}
