import { describe, expect, it } from "vitest";

import { checkImageBytes, imageDimensions, MAX_IMAGE_PIXELS, sniffImage } from "./image-magic";

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(20);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  bytes[7] = (height >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (width >> 8) & 0xff;
  bytes[10] = width & 0xff;
  return bytes;
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(10);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  bytes[6] = width & 0xff;
  bytes[7] = (width >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (height >> 8) & 0xff;
  return bytes;
}

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  const ww = width - 1;
  const hh = height - 1;
  bytes[24] = ww & 0xff;
  bytes[25] = (ww >> 8) & 0xff;
  bytes[26] = (ww >> 16) & 0xff;
  bytes[27] = hh & 0xff;
  bytes[28] = (hh >> 8) & 0xff;
  bytes[29] = (hh >> 16) & 0xff;
  return bytes;
}

describe("image magic bytes", () => {
  it("sniffs jpeg, png, gif and webp", () => {
    expect(sniffImage(jpeg(8, 4))).toBe("image/jpeg");
    expect(sniffImage(png(8, 4))).toBe("image/png");
    expect(sniffImage(gif(8, 4))).toBe("image/gif");
    expect(sniffImage(webp(8, 4))).toBe("image/webp");
    expect(sniffImage(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });

  it("rejects a declared type that does not match the header", () => {
    const result = checkImageBytes(jpeg(8, 4), "image/png");
    expect(result.ok).toBe(false);
  });

  it("reads dimensions and rejects images over 25 megapixels", () => {
    expect(imageDimensions(png(320, 240), "image/png")).toEqual({ width: 320, height: 240 });
    expect(imageDimensions(gif(320, 240), "image/gif")).toEqual({ width: 320, height: 240 });
    expect(imageDimensions(webp(320, 240), "image/webp")).toEqual({ width: 320, height: 240 });
    const tooBig = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS + 1));
    const rejected = checkImageBytes(png(tooBig, tooBig), "image/png");
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.message).toMatch(/2500/);
  });
});
