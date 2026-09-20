import { describe, expect, it } from "vitest";
import { watermarkMetrics, watermarkOverlay } from "./watermark-png";

/**
 * 外观基准：迁移前的水印实现（拼 SVG 交给 sharp/librsvg 光栅化）。
 * 保留在这里作为参照物——新实现必须和它逐像素一致，否则访客海报的水印就变了。
 */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00100", "00100"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
};

function referenceSvg(width: number, height: number): Buffer {
  const label = "TEXTTOPOSTER.COM";
  const cellSize = Math.max(3, Math.round(width / 256));
  const margin = Math.max(20, Math.round(width / 36));
  const glyphWidth = cellSize * 5;
  const gap = cellSize;
  const labelWidth = label.length * glyphWidth + (label.length - 1) * gap;
  const left = width - margin - labelWidth;
  const top = height - margin - cellSize * 7;
  const blocks = label
    .split("")
    .flatMap((character, glyphIndex) => {
      const glyph = GLYPHS[character];
      return glyph
        ? glyph.flatMap((row, rowIndex) =>
            [...row].flatMap((pixel, columnIndex) =>
              pixel === "1"
                ? [
                    `<rect x="${left + glyphIndex * (glyphWidth + gap) + columnIndex * cellSize}" y="${top + rowIndex * cellSize}" width="${cellSize}" height="${cellSize}"/>`,
                  ]
                : [],
            ),
          )
        : [];
    })
    .join("");
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><title>${label}</title><g fill="black" fill-opacity="0.45" transform="translate(2 2)">${blocks}</g><g fill="white" fill-opacity="0.9">${blocks}</g></svg>`,
  );
}

describe("watermark overlay parity", () => {
  it.each([768, 1024, 1536])(
    "matches the historical SVG rasterisation at width %i",
    async (width) => {
      const { default: sharp } = await import("sharp");
      const height = Math.round(width * 1.25);
      const overlay = watermarkOverlay(width);
      const { margin, labelWidth, labelHeight } = watermarkMetrics(width);

      const rasterised = await sharp(referenceSvg(width, height))
        .ensureAlpha()
        .extract({
          left: width - margin - labelWidth,
          top: height - margin - labelHeight,
          width: overlay.width,
          height: overlay.height,
        })
        .raw()
        .toBuffer();
      const produced = await sharp(overlay.png)
        .ensureAlpha()
        .raw()
        .toBuffer();

      expect(produced.byteLength).toBe(rasterised.byteLength);
      expect([...produced]).toEqual([...rasterised]);
    },
  );
});
