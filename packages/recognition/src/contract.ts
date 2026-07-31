import { CELL_SIZE, createGrayImage } from '@mojimoji/vision';
import type { CellImage } from '@mojimoji/vision';
import type { CharRecognizer, RecognizerFactory } from './types.js';

/**
 * 契約テストのためのハーネス。
 *
 * 実装ごとに「対象文字を書いた状態の CellImage をどう用意するか」が違う
 * （ダミーは setPendingInput、実モデルは実際にインクの載った画像）ので、
 * そこだけを実装側から注入させ、検証項目は全実装で共有する。
 */
export interface RecognizerContractHarness {
  readonly factory: RecognizerFactory;
  /**
   * chars を「紙に書いた」状態を作り、対応する CellImage を返す。
   * 必要なら recognizer への前準備（スタブの入力設定など）もここで行う。
   */
  prepare(recognizer: CharRecognizer, chars: readonly string[]): Promise<readonly CellImage[]>;
  /**
   * 認識精度を期待してよい実装か。
   * ダミーや未学習の実装では false にして、精度の検証だけを飛ばす。
   */
  readonly expectsAccuracy: boolean;
  /** 精度検証に使う文字。expectsAccuracy が true のときだけ使われる */
  readonly sampleChars?: readonly string[];
}

/** 未記入マスを作るヘルパー。契約テストと各実装のテストで共有する */
export function blankCell(index: number): CellImage {
  return {
    index,
    image: createGrayImage(CELL_SIZE, CELL_SIZE, 255),
    bbox: { x: 0, y: 0, width: CELL_SIZE, height: CELL_SIZE },
    isBlank: true,
    inkRatio: 0,
  };
}

/** 記入済みマスを作るヘルパー（中身は実装が解釈する） */
export function inkedCell(index: number, image = createGrayImage(CELL_SIZE, CELL_SIZE, 200)): CellImage {
  return {
    index,
    image,
    bbox: { x: 0, y: 0, width: CELL_SIZE, height: CELL_SIZE },
    isBlank: false,
    inkRatio: 0.2,
  };
}
