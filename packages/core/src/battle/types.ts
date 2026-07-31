import type { CellResult } from '@mojimoji/recognition';
import type { Element } from '../charset/kana.js';
import type { MojimonRecord } from '../monster/mojimon.js';

export type BattlePhase =
  | 'intro'
  | 'awaiting-input'
  | 'resolving'
  | 'enemy-turn'
  | 'won'
  | 'lost';

/** 「いま何を書けばいいか」。そのまま scanner 端末へ送られて表示される */
export interface BattlePrompt {
  /** element: 弱点属性の行から任意の字 / exact: 指定の字 / word: 指定の語 */
  readonly kind: 'element' | 'exact' | 'word';
  readonly requiredElement: Element | null;
  /** kind が exact/word のときの正解。word は 1 文字ずつの配列 */
  readonly requiredChars: readonly string[];
  /** この文字は使えない（封印ギミック） */
  readonly sealedChars: readonly string[];
  /** 必要な記入マス数 */
  readonly cellCount: number;
  readonly hintText: string;
  /** null なら時間制限なし（低年齢向け設定） */
  readonly timeLimitMs: number | null;
}

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  readonly element: Element;
  readonly maxHp: number;
  readonly attack: number;
  /** ボスは単語を要求する */
  readonly promptKind: BattlePrompt['kind'];
  /** kind が word のときの出題語 */
  readonly words?: readonly string[];
  /** 封印する文字 */
  readonly sealedChars?: readonly string[];
}

export interface BattleSettings {
  /** 制限時間。null で無制限（既定） */
  readonly timeLimitMs: number | null;
  /**
   * 間違えたときに敵の攻撃を受けるか。
   * 既定 false ＝ 学習アプリとして「失敗を罰しない」。
   * 慣れてきたら保護者設定で true にできる。
   */
  readonly punishMistakes: boolean;
  /** 認識の 1 位がこの確信度未満なら「読み取れなかった」扱いにして書き直させる */
  readonly minConfidence: number;
}

export const DEFAULT_BATTLE_SETTINGS: BattleSettings = {
  timeLimitMs: null,
  punishMistakes: false,
  minConfidence: 0.4,
};

/** 画面演出とログのための、1 回の判定結果 */
export interface ResolutionOutcome {
  readonly kind: 'hit' | 'wrong-char' | 'sealed' | 'unreadable' | 'blank';
  /** 認識された文字（unreadable/blank では null） */
  readonly char: string | null;
  readonly damage: number;
  readonly critical: boolean;
  /** 属性倍率 */
  readonly effectiveness: number;
  readonly message: string;
}

export interface BattleState {
  readonly phase: BattlePhase;
  readonly enemy: EnemyDef;
  readonly enemyHp: number;
  readonly playerHp: number;
  readonly playerMaxHp: number;
  readonly turn: number;
  readonly prompt: BattlePrompt;
  /** 直近の判定結果。UI はこれを見て演出する */
  readonly lastOutcome: ResolutionOutcome | null;
  /** 表示用ログ（新しいものが末尾） */
  readonly log: readonly string[];
  /** このバトル中に書いた文字の記録。終了時にセーブへマージする */
  readonly writes: readonly { char: string; confidence: number; quality?: number }[];
  /** 決定論的な乱数の種。アクションのたびに前進する */
  readonly rngSeed: number;
  readonly settings: BattleSettings;
  /** 制限時間の残り。timeLimitMs が null なら null */
  readonly remainingMs: number | null;
}

export type BattleAction =
  | { readonly type: 'start' }
  /** scanner から認識結果が届いた */
  | { readonly type: 'scan'; readonly results: readonly CellResult[] }
  /** 演出の完了。resolving → enemy-turn → awaiting-input を進める */
  | { readonly type: 'advance' }
  /** 制限時間の経過 */
  | { readonly type: 'tick'; readonly deltaMs: number };

export interface BattleInit {
  readonly enemy: EnemyDef;
  readonly playerMaxHp: number;
  readonly records: ReadonlyMap<string, MojimonRecord>;
  readonly settings?: BattleSettings;
  readonly seed?: number;
}
