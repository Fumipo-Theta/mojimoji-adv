import { CELL_SIZE, createGrayImage } from '../image.js';
import { DEFAULT_GRID } from '../grid.js';
import type {
  CellImage,
  DetectionResult,
  DetectorCapabilities,
  FrameSource,
  SheetDetector,
  SheetDetectorFactory,
} from '../types.js';

const CAPABILITIES: DetectorCapabilities = {
  needsMarkers: false,
  runsRealtime: true,
  correctsPerspective: false,
  typicalLatencyMs: 0,
};

/**
 * カメラを使わないスタブ検出器。
 *
 * M1 の目的は「ゲームループを最後まで通すこと」なので、検出器は常に
 * 「1マス目だけ記入済みのシート」を返す。実際の文字は DummyRecognizer 側が
 * 画面の五十音パレット入力から決めるため、ここでは中身のない CellImage で足りる。
 */
export class DummySheetDetector implements SheetDetector {
  readonly id = 'dummy';
  readonly capabilities = CAPABILITIES;

  private cellCount = 1;

  /** テスト・デモから「今回は何マス書かれたことにするか」を指示する */
  setCellCount(count: number): void {
    this.cellCount = Math.max(1, count);
  }

  async init(): Promise<void> {
    /* 読み込むものがない */
  }

  async detect(_frame: FrameSource): Promise<DetectionResult> {
    const cells: CellImage[] = [];
    const total = DEFAULT_GRID.cols * DEFAULT_GRID.rows;
    for (let i = 0; i < total; i++) {
      const filled = i < this.cellCount;
      cells.push({
        index: i,
        image: createGrayImage(CELL_SIZE, CELL_SIZE, filled ? 200 : 255),
        bbox: { x: 0, y: 0, width: CELL_SIZE, height: CELL_SIZE },
        isBlank: !filled,
        inkRatio: filled ? 0.2 : 0,
      });
    }
    return {
      ok: true,
      sheet: {
        sheetId: 'dummy-sheet',
        grid: { cols: DEFAULT_GRID.cols, rows: DEFAULT_GRID.rows },
        cells,
        warpedPreview: null,
        confidence: 1,
        corners: null,
      },
    };
  }

  async dispose(): Promise<void> {
    /* 解放するものがない */
  }
}

export const dummySheetDetectorFactory: SheetDetectorFactory = {
  id: 'dummy',
  label: 'ダミー（カメラなし）',
  capabilities: CAPABILITIES,
  create: () => new DummySheetDetector(),
};
