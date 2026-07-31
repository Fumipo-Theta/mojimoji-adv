import { BLANK_INK_THRESHOLD, crop, inkRatio, normalizeCell } from './image.js';
import type { CellImage, GrayImage } from './types.js';

export interface GridSpec {
  readonly cols: number;
  readonly rows: number;
  /** マス内側のマージン比率。罫線を拾わないよう内側を使う */
  readonly insetRatio: number;
}

export const DEFAULT_GRID: GridSpec = { cols: 3, rows: 4, insetRatio: 0.08 };
export const WORD_GRID: GridSpec = { cols: 5, rows: 1, insetRatio: 0.08 };

/**
 * 射影変換済み（＝正対した長方形になっている）シート画像を、
 * 固定グリッドでマスに切り分ける。
 *
 * 射影変換をどう実現するか（OpenCV / 手動クロップ）は検出器の責務で、
 * ここから先は全検出器で共有できる。
 */
export function sliceGrid(warped: GrayImage, spec: GridSpec = DEFAULT_GRID): CellImage[] {
  const cellW = warped.width / spec.cols;
  const cellH = warped.height / spec.rows;
  const insetX = Math.round(cellW * spec.insetRatio);
  const insetY = Math.round(cellH * spec.insetRatio);

  const cells: CellImage[] = [];
  for (let row = 0; row < spec.rows; row++) {
    for (let col = 0; col < spec.cols; col++) {
      const x = Math.round(col * cellW) + insetX;
      const y = Math.round(row * cellH) + insetY;
      const w = Math.round(cellW) - insetX * 2;
      const h = Math.round(cellH) - insetY * 2;
      const raw = crop(warped, x, y, Math.max(1, w), Math.max(1, h));
      const ratio = inkRatio(raw);
      cells.push({
        index: row * spec.cols + col,
        image: normalizeCell(raw),
        bbox: { x, y, width: w, height: h },
        isBlank: ratio < BLANK_INK_THRESHOLD,
        inkRatio: ratio,
      });
    }
  }
  return cells;
}
