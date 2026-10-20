import { IMAGE_MEDIA_TYPES, type ImageMediaType, isImageMediaType } from "./vision";

/** Design §6.8: reject images whose decoded size exceeds 25 megapixels. */
export const MAX_IMAGE_PIXELS = 25_000_000;

function startsWith(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((byte, index) => bytes[offset + index] === byte);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

/** Identify a file from its header. Declared Content-Type is not trusted. */
export function sniffImage(bytes: Uint8Array): ImageMediaType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return "image/gif";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = u16be(bytes, offset + 2);
    if (length < 2) return null;
    // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15 (not DHT/DAC/RST/SOI/EOI).
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && offset + 9 < bytes.length) {
      return { height: u16be(bytes, offset + 5), width: u16be(bytes, offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + u24le(bytes, 24);
    const height = 1 + u24le(bytes, 27);
    return { width, height };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    // Lossy: 3-byte frame tag, then 3-byte start code 9d 01 2a, then 2+2 LE dimensions.
    const start = 23;
    if (bytes[start] !== 0x9d || bytes[start + 1] !== 0x01 || bytes[start + 2] !== 0x2a) return null;
    return { width: u16le(bytes, start + 3) & 0x3fff, height: u16le(bytes, start + 5) & 0x3fff };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    if (bytes[20] !== 0x2f) return null;
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function imageDimensions(bytes: Uint8Array, type: ImageMediaType): { width: number; height: number } | null {
  if (type === "image/png") {
    if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (type === "image/gif") {
    if (bytes.length < 10) return null;
    return { width: u16le(bytes, 6), height: u16le(bytes, 8) };
  }
  if (type === "image/jpeg") return jpegSize(bytes);
  return webpSize(bytes);
}

export type ImageCheck =
  | { ok: true; mediaType: ImageMediaType; width: number; height: number }
  | { ok: false; message: string };

/**
 * Reject a declared type that does not match the file header, and reject
 * images over the pixel cap. Callers still enforce the byte-size limit.
 */
export function checkImageBytes(bytes: Uint8Array, declared: string): ImageCheck {
  if (!isImageMediaType(declared)) return { ok: false, message: "只支持 jpg、png、webp、gif 图片" };
  const sniffed = sniffImage(bytes);
  if (!sniffed) return { ok: false, message: "文件内容不是受支持的图片" };
  if (sniffed !== declared) return { ok: false, message: "文件内容和声明的图片类型不一致" };
  const size = imageDimensions(bytes, sniffed);
  if (!size || size.width <= 0 || size.height <= 0) {
    return { ok: false, message: "读不出图片尺寸" };
  }
  if (size.width * size.height > MAX_IMAGE_PIXELS) {
    return { ok: false, message: "图片像素超过 2500 万，请缩小后再传" };
  }
  return { ok: true, mediaType: sniffed, width: size.width, height: size.height };
}

export function supportedImageTypes(): readonly ImageMediaType[] {
  return IMAGE_MEDIA_TYPES;
}
