/**
 * 用紙検出レイヤの契約。
 *
 * 設計意図: カメラフレームからマス目単位の画像を切り出すところまでを担当し、
 * 「何の文字か」の判断は一切しない。認識器（@mojimoji/recognition）と独立に
 * 差し替えられることが最重要。
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * グレースケール画像。
 *
 * ImageBitmap や ImageData のような DOM 型をあえて使わない。
 * - Node 上のユニットテスト・契約テストで生成/検証できる
 * - 将来 Worker へ転送する際に structured clone が効く
 * - 認識器の実装（tfjs / kNN / WASM）がどれも同じ入力を前提にできる
 */
export interface GrayImage {
  readonly width: number;
  readonly height: number;
  /** 長さ = width * height。0 = 黒(インク), 255 = 白(紙) */
  readonly data: Uint8ClampedArray;
}

/** シート上の1マス分の切り出し結果 */
export interface CellImage {
  /** マス番号。0 origin、左上から行優先 */
  readonly index: number;
  /** 正規化済み画像（既定 96x96、余白トリム済み、白背景・黒インク） */
  readonly image: GrayImage;
  /** 元フレーム上の位置。scanner 画面のプレビュー描画に使う */
  readonly bbox: Rect;
  /** インク量が閾値以下 = 未記入。認識器は基本これを飛ばす */
  readonly isBlank: boolean;
  /** インク被覆率 0..1。字の濃さ・大きさのヒント */
  readonly inkRatio: number;
}

/** 用紙1枚の検出結果 */
export interface DetectedSheet {
  /** 用紙 ID（枠外 QR から読む）。読めなければ 'unknown' */
  readonly sheetId: string;
  /** グリッド定義（列数 x 行数） */
  readonly grid: { cols: number; rows: number };
  readonly cells: readonly CellImage[];
  /** 射影変換後のプレビュー。scanner 画面で「こう認識されています」を見せる */
  readonly warpedPreview: GrayImage | null;
  /** 検出の確からしさ 0..1。ガイド枠の色に反映する */
  readonly confidence: number;
  /** 元フレーム上の用紙四隅（左上から時計回り）。ガイド枠のオーバーレイ用 */
  readonly corners: readonly [Point, Point, Point, Point] | null;
}

/** 検出に失敗した理由。scanner 画面のヒント表示にそのまま使う */
export type DetectionHint =
  | 'no-sheet'
  | 'too-dark'
  | 'too-bright'
  | 'blurry'
  | 'partial'
  | 'skewed';

export interface DetectionFailure {
  readonly ok: false;
  readonly hint: DetectionHint;
}

export interface DetectionSuccess {
  readonly ok: true;
  readonly sheet: DetectedSheet;
}

export type DetectionResult = DetectionSuccess | DetectionFailure;

/**
 * 検出器への入力。
 * ブラウザでは HTMLVideoElement / ImageBitmap を、テストでは GrayImage を渡す。
 */
export type FrameSource = GrayImage | { readonly kind: 'dom'; readonly source: unknown };

export interface DetectorCapabilities {
  /** 用紙にマーカー（太枠・QR）の印刷が必要か */
  readonly needsMarkers: boolean;
  /** 毎フレーム呼んでよい速度か。false なら撮影ボタン方式にする */
  readonly runsRealtime: boolean;
  /** 傾き・射影の補正ができるか */
  readonly correctsPerspective: boolean;
  /** 想定レイテンシ。UI のスピナー表示判断に使う */
  readonly typicalLatencyMs: number;
}

export interface SheetDetector {
  readonly id: string;
  readonly capabilities: DetectorCapabilities;
  /** モデルや WASM の読み込み。onProgress は 0..1 */
  init(onProgress?: (ratio: number) => void): Promise<void>;
  detect(frame: FrameSource): Promise<DetectionResult>;
  dispose(): Promise<void>;
}

/** 検出器のファクトリ。レジストリに登録する単位 */
export interface SheetDetectorFactory {
  readonly id: string;
  readonly label: string;
  readonly capabilities: DetectorCapabilities;
  create(): SheetDetector;
}
