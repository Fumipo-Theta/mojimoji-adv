import { getCharMeta, type CharMeta, type Element, type Rarity } from '../charset/kana.js';

/**
 * モジモン = 1 文字 1 体。
 *
 * 設計の要:「書いた質」がそのままステータスになるので、練習が強化に直結する。
 * 保存するのは書いた履歴（MojimonRecord）だけで、ステータスは常に導出する。
 * こうしておくとバランス調整が数値の再計算だけで済む。
 */

/** 永続化する記録。セーブデータに入るのはこれだけ */
export interface MojimonRecord {
  readonly char: string;
  /** 通算で何回書いたか。レベルの源泉 */
  readonly writeCount: number;
  /** これまでの最高 quality 0..1。「うつくしさ」の源泉 */
  readonly bestQuality: number;
  /** 直近の平均 confidence 0..1。「せいかく度」の源泉 */
  readonly avgConfidence: number;
  /** 初めて書けた時刻（epoch ms）。図鑑の登録日 */
  readonly discoveredAt: number;
}

/** 表示・戦闘に使う導出ステータス */
export interface Mojimon {
  readonly char: string;
  readonly meta: CharMeta;
  readonly element: Element;
  readonly rarity: Rarity;
  readonly level: number;
  /** 攻撃力 */
  readonly power: number;
  /** うつくしさ 0..1。クリティカル率になる */
  readonly beauty: number;
  /** せいかく度 0..1。ダメージ倍率になる */
  readonly accuracy: number;
}

export function createRecord(char: string, now: number): MojimonRecord {
  return { char, writeCount: 0, bestQuality: 0, avgConfidence: 0, discoveredAt: now };
}

/**
 * 1 回書いた結果を記録に反映する。
 * avgConfidence は直近を重めに見る指数移動平均（上達がすぐ数値に出るように）。
 */
export function recordWrite(
  record: MojimonRecord,
  confidence: number,
  quality: number | undefined,
): MojimonRecord {
  const alpha = 0.3;
  const nextAvg =
    record.writeCount === 0 ? confidence : record.avgConfidence * (1 - alpha) + confidence * alpha;
  return {
    ...record,
    writeCount: record.writeCount + 1,
    bestQuality: Math.max(record.bestQuality, quality ?? 0),
    avgConfidence: nextAvg,
  };
}

/**
 * レベル = 1 + floor(sqrt(書いた回数))。
 * 序盤は数回で上がって手応えが出て、後半は緩やかになる。
 */
export function levelOf(writeCount: number): number {
  return 1 + Math.floor(Math.sqrt(writeCount));
}

/** レアリティごとの基礎攻撃力。難しい文字ほど強い＝挑戦する動機になる */
const BASE_POWER: Readonly<Record<Rarity, number>> = {
  1: 10, // ひらがな清音
  2: 14, // 濁音・半濁音
  3: 18, // カタカナ
  4: 24, // 単語（合体召喚）
  5: 32, // 漢字（将来）
};

export function deriveMojimon(record: MojimonRecord): Mojimon {
  const meta = getCharMeta(record.char);
  if (!meta) throw new Error(`未知の文字です: ${record.char}`);
  const level = levelOf(record.writeCount);
  const base = BASE_POWER[meta.rarity];
  return {
    char: record.char,
    meta,
    element: meta.element,
    rarity: meta.rarity,
    level,
    power: Math.round(base * (1 + (level - 1) * 0.15)),
    beauty: record.bestQuality,
    accuracy: record.avgConfidence,
  };
}

/**
 * 進化の可否。「か」を持っていると「が」が解放される、という導線。
 * カタカナは対応するひらがなを一定回数書いていることを条件にして、
 * 難しい文字にいきなり飛ばないようにする。
 */
export function evolutionSource(char: string): string | null {
  const meta = getCharMeta(char);
  if (!meta) return null;
  switch (meta.kind) {
    case 'dakuon':
    case 'handakuon':
      return meta.base;
    case 'katakana':
      return meta.base;
    default:
      return null;
  }
}

/** カタカナ解放に必要な、元のひらがなの記入回数 */
export const KATAKANA_UNLOCK_WRITES = 3;

export function isUnlocked(char: string, records: ReadonlyMap<string, MojimonRecord>): boolean {
  const meta = getCharMeta(char);
  if (!meta) return false;
  if (meta.kind === 'seion') return true;

  const source = evolutionSource(char);
  if (!source) return true;
  const sourceRecord = records.get(source);
  if (!sourceRecord) return false;

  const required = meta.kind === 'katakana' ? KATAKANA_UNLOCK_WRITES : 1;
  return sourceRecord.writeCount >= required;
}
