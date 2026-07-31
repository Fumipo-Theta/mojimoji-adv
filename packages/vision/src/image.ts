import type { GrayImage } from './types.js';

/** 正規化後のマス画像の一辺。認識器はこのサイズを前提にしてよい */
export const CELL_SIZE = 96;

/** これ未満のインク被覆率なら未記入とみなす */
export const BLANK_INK_THRESHOLD = 0.005;

/** 0..255 で、これより暗ければインクとみなす */
export const INK_LEVEL = 160;

export function createGrayImage(width: number, height: number, fill = 255): GrayImage {
  const data = new Uint8ClampedArray(width * height);
  data.fill(fill);
  return { width, height, data };
}

export function getPixel(img: GrayImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 255;
  return img.data[y * img.width + x] ?? 255;
}

/** インク（暗いピクセル）の被覆率 0..1 */
export function inkRatio(img: GrayImage): number {
  const total = img.width * img.height;
  if (total === 0) return 0;
  let ink = 0;
  for (let i = 0; i < total; i++) {
    if ((img.data[i] ?? 255) < INK_LEVEL) ink++;
  }
  return ink / total;
}

/** インク部分のバウンディングボックス。インクが無ければ null */
export function inkBounds(
  img: GrayImage,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if ((img.data[y * img.width + x] ?? 255) < INK_LEVEL) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** 最近傍リサイズ。マス画像は低解像度なのでこれで足りる */
export function resize(img: GrayImage, width: number, height: number): GrayImage {
  const out = createGrayImage(width, height);
  const data = out.data;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y * img.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x * img.width) / width));
      data[y * width + x] = img.data[sy * img.width + sx] ?? 255;
    }
  }
  return out;
}

/**
 * 認識器への入力を揃える正規化。
 *
 * 1. インクのバウンディングボックスで切り出す（マスのどこに書いても同じ扱いになる）
 * 2. アスペクト比を保ったまま正方形にパディング（字が潰れない）
 * 3. CELL_SIZE に縮小し、周囲に余白を付ける
 *
 * 字の絶対的な大きさ・位置は落ちるが、それは inkRatio 側で別途保持している。
 */
export function normalizeCell(img: GrayImage, size = CELL_SIZE): GrayImage {
  const bounds = inkBounds(img);
  if (!bounds) return createGrayImage(size, size);

  const w = bounds.x1 - bounds.x0 + 1;
  const h = bounds.y1 - bounds.y0 + 1;
  const side = Math.max(w, h);
  // 正方形キャンバスの中心にインク領域を置く
  const square = createGrayImage(side, side);
  const offX = Math.floor((side - w) / 2);
  const offY = Math.floor((side - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      square.data[(y + offY) * side + (x + offX)] = getPixel(img, bounds.x0 + x, bounds.y0 + y);
    }
  }

  // 上下左右に 10% の余白を残して縮小（枠に接した字が切れて見えるのを防ぐ）
  const inner = Math.round(size * 0.8);
  const scaled = resize(square, inner, inner);
  const out = createGrayImage(size, size);
  const pad = Math.floor((size - inner) / 2);
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      out.data[(y + pad) * size + (x + pad)] = scaled.data[y * inner + x] ?? 255;
    }
  }
  return out;
}

/** 矩形の切り出し。範囲外は白で埋める */
export function crop(
  img: GrayImage,
  x: number,
  y: number,
  width: number,
  height: number,
): GrayImage {
  const out = createGrayImage(width, height);
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      out.data[dy * width + dx] = getPixel(img, x + dx, y + dy);
    }
  }
  return out;
}

/** 正規化済み画像を 0..1 の Float32Array にする。認識器の共通入力形式 */
export function toFloatVector(img: GrayImage): Float32Array {
  const out = new Float32Array(img.data.length);
  for (let i = 0; i < img.data.length; i++) {
    // インクを 1.0、紙を 0.0 に（学習時の慣例に合わせる）
    out[i] = 1 - (img.data[i] ?? 255) / 255;
  }
  return out;
}
