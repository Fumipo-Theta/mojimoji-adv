import type { CellImage } from '@mojimoji/vision';

/**
 * 文字認識レイヤの契約。
 *
 * この IF がこのプロジェクトで最も安定していなければならない部分。
 * 認識の中身（ダミー / kNN / CNN / クラウド）は必ず入れ替わる前提で、
 * ゲーム側は CharRecognizer だけを知っていればよい状態を保つ。
 */

export type Script = 'hiragana' | 'katakana' | 'kanji' | 'digit';

export interface CharCandidate {
  /** 認識された文字 1 字 */
  readonly char: string;
  /** 0..1。実装間で意味を揃えるため「この文字である確率」とする */
  readonly confidence: number;
}

export interface CellResult {
  /** 対応する CellImage.index */
  readonly index: number;
  /** confidence 降順。空配列 = 認識できなかった */
  readonly candidates: readonly CharCandidate[];
  /**
   * 字形の綺麗さ 0..1。ゲーム内の「うつくしさ」ステータスに使う。
   * 算出できない実装は undefined を返してよい（UI 側でステータス非表示になる）。
   */
  readonly quality?: number;
}

export interface RecognizeOptions {
  /**
   * 候補の出力空間をこの文字集合に「限定する」ハード制約。
   * 指定した場合、実装は必ずこの集合内の文字だけを返さなければならない。
   *
   * 使いどころに注意:
   * - 適する例: ミニゲーム「おなじもじさがし」のように、出題した数文字の
   *   いずれかであることが確定していて、判定が yes/no でよい場面。精度が上がる。
   * - 適さない例: バトルで「か行を書け」と指示している場面。集合外の字を書いても
   *   集合内の最も近い字に丸められてしまい、「それは さ だよ」と教えられなくなる。
   *   この場合は charset を渡さず全文字で認識し、正誤判定はゲーム側で行うこと。
   */
  readonly charset?: readonly string[];
  /** 返す候補数。既定 3 */
  readonly topK?: number;
  readonly signal?: AbortSignal;
}

export interface RecognizerCapabilities {
  readonly supportedScripts: readonly Script[];
  /** 1 回の recognize() に渡してよいマス数の上限 */
  readonly maxCellsPerCall: number;
  /** CellResult.quality を返せるか */
  readonly supportsQualityScore: boolean;
  /**
   * ネットワークに出ずに完結するか。
   * false の実装は保護者設定で明示的に許可されない限り選択できない。
   * （子供の筆跡を外部送信することになるため）
   */
  readonly runsOffline: boolean;
  /** 想定レイテンシ。バトルの詠唱アニメの尺を決めるのに使う */
  readonly typicalLatencyMs: number;
}

export interface CharRecognizer {
  readonly id: string;
  readonly capabilities: RecognizerCapabilities;
  /** モデル読み込み。onProgress は 0..1 でローディング表示に使う */
  init(onProgress?: (ratio: number) => void): Promise<void>;
  recognize(
    cells: readonly CellImage[],
    options?: RecognizeOptions,
  ): Promise<readonly CellResult[]>;
  dispose(): Promise<void>;
}

export interface RecognizerFactory {
  readonly id: string;
  /** 保護者設定の選択肢に出す表示名 */
  readonly label: string;
  readonly capabilities: RecognizerCapabilities;
  create(): CharRecognizer;
}
