/**
 * 水印叠加层：纯 JS 生成 PNG，两个运行时共用。
 *
 * 以前这里是「拼一段 SVG 再交给 sharp 光栅化」，但 workerd 里没有本地图片库，
 * 而 Cloudflare Images 的 .draw() 只接受图片字节（SVG 不是受支持的叠加格式）。
 * 字模本来就是一堆整数坐标的矩形，直接写成像素再编码成 PNG，两边拿到完全一样的
 * 叠加层——而且不再依赖 librsvg / 系统字体。
 */

const WATERMARK_GLYPHS: Readonly<Record<string, readonly string[]>> = {
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

const LABEL = "TEXTTOPOSTER.COM";
const GLYPH_ROWS = 7;
/** 阴影偏移（像素），与历史上的 SVG translate(2 2) 一致 */
const SHADOW_OFFSET = 2;
const SHADOW_ALPHA = 0.45;
const LABEL_ALPHA = 0.9;

export type WatermarkMetrics = Readonly<{
  /** 字模格边长 */
  cellSize: number;
  /** 水印距图片右下角的内缩距离（按标签本体算） */
  margin: number;
  /** 标签本体尺寸 */
  labelWidth: number;
  labelHeight: number;
}>;

export function watermarkMetrics(imageWidth: number): WatermarkMetrics {
  const cellSize = Math.max(3, Math.round(imageWidth / 256));
  const margin = Math.max(20, Math.round(imageWidth / 36));
  const glyphWidth = cellSize * 5;
  const gap = cellSize;
  const labelWidth = LABEL.length * glyphWidth + (LABEL.length - 1) * gap;
  return { cellSize, margin, labelWidth, labelHeight: cellSize * GLYPH_ROWS };
}

export type WatermarkOverlay = Readonly<{
  /** 叠加层 PNG（含 2px 阴影，原点对齐标签本体左上角） */
  png: Buffer;
  width: number;
  height: number;
  /** PNG 边界相对标签本体多出的像素（阴影外扩），定位时要减掉 */
  shadowOffset: number;
  metrics: WatermarkMetrics;
}>;

export function watermarkOverlay(imageWidth: number): WatermarkOverlay {
  const metrics = watermarkMetrics(imageWidth);
  const { cellSize, labelWidth, labelHeight } = metrics;
  const width = labelWidth + SHADOW_OFFSET;
  const height = labelHeight + SHADOW_OFFSET;
  const rgba = Buffer.alloc(width * height * 4);
  const glyphWidth = cellSize * 5;
  const gap = cellSize;

  const blocks: Array<[number, number]> = [];
  for (const [glyphIndex, character] of [...LABEL].entries()) {
    const glyph = WATERMARK_GLYPHS[character];
    if (!glyph) {
      continue;
    }
    for (const [rowIndex, row] of glyph.entries()) {
      for (const [columnIndex, pixel] of [...row].entries()) {
        if (pixel !== "1") {
          continue;
        }
        blocks.push([
          glyphIndex * (glyphWidth + gap) + columnIndex * cellSize,
          rowIndex * cellSize,
        ]);
      }
    }
  }
  // SVG 是「先画整层阴影、再画整层白字」，顺序要一致才是逐像素相同的结果
  for (const [x, y] of blocks) {
    fillBlock(rgba, width, height, x + SHADOW_OFFSET, y + SHADOW_OFFSET, cellSize, 0, 0, 0, SHADOW_ALPHA);
  }
  for (const [x, y] of blocks) {
    fillBlock(rgba, width, height, x, y, cellSize, 255, 255, 255, LABEL_ALPHA);
  }
  return {
    png: encodePng(rgba, width, height),
    width,
    height,
    shadowOffset: SHADOW_OFFSET,
    metrics,
  };
}

/** source-over 填充一个正方形块（alpha 为 0–1 的直通透明度） */
function fillBlock(
  rgba: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  size: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): void {
  for (let row = y; row < y + size; row += 1) {
    if (row < 0 || row >= height) {
      continue;
    }
    for (let column = x; column < x + size; column += 1) {
      if (column < 0 || column >= width) {
        continue;
      }
      const offset = (row * width + column) * 4;
      const destination = (rgba[offset + 3] ?? 0) / 255;
      const out = alpha + destination * (1 - alpha);
      if (out <= 0) {
        continue;
      }
      const mix = (source: number, existing: number): number =>
        Math.round((source * alpha + existing * destination * (1 - alpha)) / out);
      rgba[offset] = mix(red, rgba[offset] ?? 0);
      rgba[offset + 1] = mix(green, rgba[offset + 1] ?? 0);
      rgba[offset + 2] = mix(blue, rgba[offset + 2] ?? 0);
      rgba[offset + 3] = Math.round(out * 255);
    }
  }
}

// —— 最小 PNG 编码器（8 位 RGBA，deflate 用 stored 块，不引入压缩依赖） ——

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

/** zlib 容器 + 全 stored 的 deflate 块（对我们这种小图，体积代价可以接受） */
function zlibStored(raw: Buffer): Buffer {
  const blocks: Buffer[] = [Buffer.from([0x78, 0x01])];
  const maxBlock = 65_535;
  for (let offset = 0; offset < raw.length; offset += maxBlock) {
    const end = Math.min(offset + maxBlock, raw.length);
    const length = end - offset;
    const header = Buffer.alloc(5);
    header[0] = end === raw.length ? 1 : 0; // BFINAL / BTYPE=00
    header.writeUInt16LE(length, 1);
    header.writeUInt16LE(length ^ 0xffff, 3);
    blocks.push(header, raw.subarray(offset, end));
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(adler32(raw), 0);
  blocks.push(adler);
  return Buffer.concat(blocks);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Buffer): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65_521;
    b = (b + a) % 65_521;
  }
  return ((b << 16) | a) >>> 0;
}
