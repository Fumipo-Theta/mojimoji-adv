import type { CellImage } from '@mojimoji/vision';
import type {
  CellResult,
  CharCandidate,
  CharRecognizer,
  RecognizeOptions,
  RecognizerCapabilities,
  RecognizerFactory,
} from '../types.js';

const CAPABILITIES: RecognizerCapabilities = {
  supportedScripts: ['hiragana', 'katakana', 'kanji', 'digit'],
  maxCellsPerCall: 12,
  supportsQualityScore: true,
  runsOffline: true,
  typicalLatencyMs: 400,
};

/** 決定論的な擬似乱数。E2E とユニットテストを安定させるために自前で持つ */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DummyRecognizerOptions {
  /** 擬似乱数シード。同じシードなら常に同じ confidence を返す */
  readonly seed?: number;
  /** 遅延をシミュレートする。テストでは 0 にする */
  readonly latencyMs?: number;
  /**
   * 認識ミスを起こす確率 0..1。
   * 「認識が外れたときに UI が正しく再挑戦へ導けるか」を試すために入れてある。
   */
  readonly errorRate?: number;
}

/**
 * カメラもモデルも使わないスタブ認識器。
 *
 * 実際の入力は scanner 画面の五十音パレットから来る。setPendingInput() で
 * 「いま紙に書かれたことにする文字列」を渡し、recognize() がそれを
 * CellResult に整形して返す。
 *
 * これが M1 の主役。ゲームループ・UI・プロトコルを、認識精度という
 * 不確実要素抜きで完成させるために存在する。E2E テストの入力源も兼ねる。
 */
export class DummyRecognizer implements CharRecognizer {
  readonly id = 'dummy';
  readonly capabilities = CAPABILITIES;

  private pending: string[] = [];
  private readonly random: () => number;
  private readonly latencyMs: number;
  private readonly errorRate: number;

  constructor(options: DummyRecognizerOptions = {}) {
    this.random = mulberry32(options.seed ?? 42);
    this.latencyMs = options.latencyMs ?? 0;
    this.errorRate = options.errorRate ?? 0;
  }

  /** 「紙に書かれた」ことにする文字列を設定する */
  setPendingInput(chars: readonly string[]): void {
    this.pending = [...chars];
  }

  async init(onProgress?: (ratio: number) => void): Promise<void> {
    onProgress?.(1);
  }

  async recognize(
    cells: readonly CellImage[],
    options: RecognizeOptions = {},
  ): Promise<readonly CellResult[]> {
    if (cells.length > this.capabilities.maxCellsPerCall) {
      throw new Error(
        `一度に認識できるのは ${this.capabilities.maxCellsPerCall} マスまでです（${cells.length} 指定）`,
      );
    }
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    options.signal?.throwIfAborted();

    const topK = options.topK ?? 3;
    const written = cells.filter((c) => !c.isBlank);
    const results: CellResult[] = [];

    for (const cell of cells) {
      if (cell.isBlank) {
        results.push({ index: cell.index, candidates: [] });
        continue;
      }
      // 記入済みマスの並び順に pending の文字を割り当てる
      const slot = written.indexOf(cell);
      const intended = this.pending[slot];
      if (intended === undefined) {
        results.push({ index: cell.index, candidates: [] });
        continue;
      }
      results.push({
        index: cell.index,
        candidates: this.buildCandidates(intended, topK, options.charset),
        quality: 0.5 + this.random() * 0.5,
      });
    }
    return results;
  }

  private buildCandidates(
    intended: string,
    topK: number,
    charset: readonly string[] | undefined,
  ): CharCandidate[] {
    const allowed = charset && charset.length > 0 ? [...new Set(charset)] : null;

    // charset 指定時は必ずその集合内から返す（IF のハード制約）
    if (allowed && !allowed.includes(intended)) {
      // 書かれた字が出力空間の外。集合内で最も近いものを低い確信度で返す
      const chars = allowed.slice(0, Math.max(1, topK));
      let level = 0.2 + this.random() * 0.2;
      return chars.map((char) => {
        const candidate = { char, confidence: Number(level.toFixed(4)) };
        level *= 0.7;
        return candidate;
      });
    }

    const pool = allowed ?? [intended];
    const alternatives = pool.filter((c) => c !== intended);
    // 誤認識シミュレーション: 別の文字を 1 位に据えて、UI の再挑戦導線を試せるようにする
    const misrecognized = this.random() < this.errorRate && alternatives.length > 0;
    const first = misrecognized
      ? (alternatives[Math.floor(this.random() * alternatives.length)] ?? intended)
      : intended;

    const chars = [first, ...pool.filter((c) => c !== first)].slice(0, Math.max(1, topK));

    // confidence は厳密な降順にする（契約テストで検証される）
    let level = 0.75 + this.random() * 0.24;
    return chars.map((char) => {
      const candidate = { char, confidence: Number(level.toFixed(4)) };
      level *= 0.35;
      return candidate;
    });
  }

  async dispose(): Promise<void> {
    this.pending = [];
  }
}

export const dummyRecognizerFactory: RecognizerFactory = {
  id: 'dummy',
  label: 'ダミー（画面から文字を選ぶ）',
  capabilities: CAPABILITIES,
  create: () => new DummyRecognizer(),
};
