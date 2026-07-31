import type { CellResult } from '@mojimoji/recognition';
import {
  ROWS,
  effectiveness,
  getCharMeta,
  weaknessOf,
  type Element,
} from '../charset/kana.js';
import { deriveMojimon, type MojimonRecord } from '../monster/mojimon.js';
import {
  DEFAULT_BATTLE_SETTINGS,
  type BattleAction,
  type BattleInit,
  type BattlePrompt,
  type BattleState,
  type ResolutionOutcome,
} from './types.js';

/**
 * ターン制バトルの純粋 reducer。
 *
 * DOM にも認識器にも依存しない。入力は「認識結果」という抽象だけなので、
 * ダミー認識でも CNN でもクラウドでも、この関数は 1 行も変わらない。
 * 乱数は state.rngSeed に閉じ込めてあるため、同じ入力列からは常に同じ結果になる
 * （E2E テストとリプレイのため）。
 */

function nextRandom(seed: number): { value: number; seed: number } {
  let a = (seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: a };
}

/** 敵の弱点属性を持つ行を返す */
function rowForElement(element: Element): (typeof ROWS)[number] {
  const row = ROWS.find((r) => r.element === element);
  if (!row) throw new Error(`属性 ${element} に対応する行がありません`);
  return row;
}

export function buildPrompt(state: {
  enemy: BattleState['enemy'];
  turn: number;
  settings: BattleState['settings'];
  rngSeed: number;
}): { prompt: BattlePrompt; rngSeed: number } {
  const { enemy, settings } = state;
  const sealed = enemy.sealedChars ?? [];

  if (enemy.promptKind === 'word') {
    const words = enemy.words ?? [];
    const { value, seed } = nextRandom(state.rngSeed);
    const word = words[Math.floor(value * words.length)] ?? 'たいよう';
    const chars = [...word];
    return {
      rngSeed: seed,
      prompt: {
        kind: 'word',
        requiredElement: null,
        requiredChars: chars,
        sealedChars: sealed,
        cellCount: chars.length,
        hintText: `「${word}」をとなえよ！`,
        timeLimitMs: settings.timeLimitMs,
      },
    };
  }

  if (enemy.promptKind === 'exact') {
    const row = rowForElement(weaknessOf(enemy.element));
    const { value, seed } = nextRandom(state.rngSeed);
    const available = row.chars.filter((c) => !sealed.includes(c));
    const char = available[Math.floor(value * available.length)] ?? row.chars[0] ?? 'あ';
    return {
      rngSeed: seed,
      prompt: {
        kind: 'exact',
        requiredElement: row.element,
        requiredChars: [char],
        sealedChars: sealed,
        cellCount: 1,
        hintText: `「${char}」をかいて！`,
        timeLimitMs: settings.timeLimitMs,
      },
    };
  }

  // element: 弱点属性の行なら何でもよい（自由度が高く、低年齢でも成功しやすい）
  const weakness = weaknessOf(enemy.element);
  const row = rowForElement(weakness);
  return {
    rngSeed: state.rngSeed,
    prompt: {
      kind: 'element',
      requiredElement: weakness,
      requiredChars: [],
      sealedChars: sealed,
      cellCount: 1,
      hintText: `${enemy.name}は「${weakness}」がにがて！ ${row.label}のもじをかこう`,
      timeLimitMs: settings.timeLimitMs,
    },
  };
}

export function createBattle(init: BattleInit): BattleState {
  const settings = init.settings ?? DEFAULT_BATTLE_SETTINGS;
  const seed = init.seed ?? 1;
  const { prompt, rngSeed } = buildPrompt({
    enemy: init.enemy,
    turn: 1,
    settings,
    rngSeed: seed,
  });
  return {
    phase: 'intro',
    enemy: init.enemy,
    enemyHp: init.enemy.maxHp,
    playerHp: init.playerMaxHp,
    playerMaxHp: init.playerMaxHp,
    turn: 1,
    prompt,
    lastOutcome: null,
    log: [`${init.enemy.name}があらわれた！`],
    writes: [],
    rngSeed,
    settings,
    remainingMs: settings.timeLimitMs,
  };
}

/**
 * 認識結果からダメージを計算する。
 *
 * 「書きの質」が強さになるという設計の中心。
 * - confidence（せいかく度）: 0.5〜1.0 倍
 * - 属性相性: 0.5 / 1.0 / 2.0 倍
 * - quality（うつくしさ）: クリティカル率
 */
export function computeDamage(params: {
  readonly char: string;
  readonly confidence: number;
  readonly quality: number | undefined;
  readonly enemyElement: Element;
  readonly records: ReadonlyMap<string, MojimonRecord>;
  readonly rngSeed: number;
}): { damage: number; critical: boolean; effectiveness: number; rngSeed: number } {
  const meta = getCharMeta(params.char);
  if (!meta) {
    return { damage: 0, critical: false, effectiveness: 1, rngSeed: params.rngSeed };
  }

  const record = params.records.get(params.char);
  const power = record
    ? deriveMojimon(record).power
    : deriveMojimon({
        char: params.char,
        writeCount: 0,
        bestQuality: 0,
        avgConfidence: 0,
        discoveredAt: 0,
      }).power;

  const multiplier = effectiveness(meta.element, params.enemyElement);
  const accuracyBonus = 0.5 + Math.min(1, Math.max(0, params.confidence)) * 0.5;

  // うつくしさが高いほどクリティカルしやすい。上限 50%
  const critChance = Math.min(0.5, (params.quality ?? 0) * 0.5);
  const { value, seed } = nextRandom(params.rngSeed);
  const critical = value < critChance;

  const damage = Math.max(
    1,
    Math.round(power * multiplier * accuracyBonus * (critical ? 1.5 : 1)),
  );
  return { damage, critical, effectiveness: multiplier, rngSeed: seed };
}

/** 認識結果 1 マス分を、プロンプトに照らして判定する */
function judgeCell(
  result: CellResult | undefined,
  prompt: BattlePrompt,
  expectedChar: string | null,
  minConfidence: number,
): { kind: ResolutionOutcome['kind']; char: string | null; message: string } {
  if (!result || result.candidates.length === 0) {
    return { kind: 'blank', char: null, message: 'なにもかかれていないみたい。もういちど！' };
  }
  const top = result.candidates[0];
  if (!top || top.confidence < minConfidence) {
    return {
      kind: 'unreadable',
      char: null,
      message: 'うーん、よみとれなかった。もういちど かいてみて！',
    };
  }
  if (prompt.sealedChars.includes(top.char)) {
    return {
      kind: 'sealed',
      char: top.char,
      message: `「${top.char}」はふういんされている！ ほかのもじをさがそう`,
    };
  }

  if (prompt.kind === 'element') {
    const meta = getCharMeta(top.char);
    if (!meta || meta.element !== prompt.requiredElement) {
      return {
        kind: 'wrong-char',
        char: top.char,
        message: `「${top.char}」だね！ でも「${prompt.requiredElement}」のもじをさがそう`,
      };
    }
    return { kind: 'hit', char: top.char, message: `「${top.char}」のこうげき！` };
  }

  if (expectedChar !== null && top.char !== expectedChar) {
    return {
      kind: 'wrong-char',
      char: top.char,
      message: `「${top.char}」とよめたよ。ほしいのは「${expectedChar}」！`,
    };
  }
  return { kind: 'hit', char: top.char, message: `「${top.char}」のこうげき！` };
}

function withLog(state: BattleState, ...lines: readonly string[]): readonly string[] {
  // ログは直近 20 行だけ保持する（長時間プレイでも UI が重くならないように）
  return [...state.log, ...lines].slice(-20);
}

export function battleReducer(
  state: BattleState,
  action: BattleAction,
  records: ReadonlyMap<string, MojimonRecord>,
): BattleState {
  switch (action.type) {
    case 'start': {
      if (state.phase !== 'intro') return state;
      return { ...state, phase: 'awaiting-input' };
    }

    case 'tick': {
      if (state.phase !== 'awaiting-input' || state.remainingMs === null) return state;
      const remaining = state.remainingMs - action.deltaMs;
      if (remaining > 0) return { ...state, remainingMs: remaining };
      // 時間切れ。学習アプリなので HP は減らさず、出題し直すだけ
      const { prompt, rngSeed } = buildPrompt({ ...state, turn: state.turn + 1 });
      return {
        ...state,
        remainingMs: state.settings.timeLimitMs,
        prompt,
        rngSeed,
        log: withLog(state, 'じかんぎれ！ つぎのもんだいだよ'),
      };
    }

    case 'scan': {
      if (state.phase !== 'awaiting-input') return state;
      return resolveScan(state, action.results, records);
    }

    case 'advance': {
      if (state.phase === 'resolving') {
        if (state.enemyHp <= 0) {
          return { ...state, phase: 'won', log: withLog(state, `${state.enemy.name}をたおした！`) };
        }
        const outcome = state.lastOutcome;
        // 「失敗を罰しない」設定では、間違えても敵は攻撃してこない
        const enemyActs =
          outcome?.kind === 'hit' || (state.settings.punishMistakes && outcome?.kind !== 'blank');
        return enemyActs
          ? { ...state, phase: 'enemy-turn' }
          : { ...state, phase: 'awaiting-input' };
      }

      if (state.phase === 'enemy-turn') {
        const playerHp = Math.max(0, state.playerHp - state.enemy.attack);
        const base: BattleState = {
          ...state,
          playerHp,
          turn: state.turn + 1,
          log: withLog(state, `${state.enemy.name}のこうげき！`),
        };
        if (playerHp <= 0) {
          return { ...base, phase: 'lost', log: withLog(base, 'まけてしまった… もういちど ちょうせん！') };
        }
        const { prompt, rngSeed } = buildPrompt(base);
        return { ...base, phase: 'awaiting-input', prompt, rngSeed, remainingMs: base.settings.timeLimitMs };
      }

      return state;
    }
  }
}

function resolveScan(
  state: BattleState,
  results: readonly CellResult[],
  records: ReadonlyMap<string, MojimonRecord>,
): BattleState {
  const written = results.filter((r) => r.candidates.length > 0);
  const prompt = state.prompt;

  // 単語出題では、必要なマス数が揃うまで判定を保留する
  if (prompt.cellCount > 1 && written.length < prompt.cellCount) {
    return {
      ...state,
      lastOutcome: {
        kind: 'blank',
        char: null,
        damage: 0,
        critical: false,
        effectiveness: 1,
        message: `あと ${prompt.cellCount - written.length} もじ かいてね`,
      },
      phase: 'resolving',
    };
  }

  let seed = state.rngSeed;
  let totalDamage = 0;
  let anyCritical = false;
  let effect = 1;
  const messages: string[] = [];
  const writes = [...state.writes];
  let firstFailure: ResolutionOutcome | null = null;

  for (let i = 0; i < prompt.cellCount; i++) {
    const expected = prompt.kind === 'element' ? null : (prompt.requiredChars[i] ?? null);
    const judged = judgeCell(written[i], prompt, expected, state.settings.minConfidence);

    if (judged.kind !== 'hit') {
      // 読めた文字は、出題と違っていても「書けた」記録として残す（練習は無駄にしない）
      const top = written[i]?.candidates[0];
      if (judged.char && top && getCharMeta(judged.char)) {
        writes.push({ char: judged.char, confidence: top.confidence, quality: written[i]?.quality });
      }
      firstFailure ??= {
        kind: judged.kind,
        char: judged.char,
        damage: 0,
        critical: false,
        effectiveness: 1,
        message: judged.message,
      };
      continue;
    }

    const cell = written[i];
    const top = cell?.candidates[0];
    if (!cell || !top || !judged.char) continue;

    const dmg = computeDamage({
      char: judged.char,
      confidence: top.confidence,
      quality: cell.quality,
      enemyElement: state.enemy.element,
      records,
      rngSeed: seed,
    });
    seed = dmg.rngSeed;
    totalDamage += dmg.damage;
    anyCritical ||= dmg.critical;
    effect = dmg.effectiveness;
    messages.push(judged.message);
    writes.push({ char: judged.char, confidence: top.confidence, quality: cell.quality });
  }

  if (firstFailure) {
    return {
      ...state,
      phase: 'resolving',
      rngSeed: seed,
      writes,
      lastOutcome: firstFailure,
      log: withLog(state, firstFailure.message),
    };
  }

  if (anyCritical) messages.push('クリティカル！');
  if (effect > 1) messages.push('こうかは ばつぐんだ！');
  else if (effect < 1) messages.push('こうかは いまひとつ…');

  const enemyHp = Math.max(0, state.enemyHp - totalDamage);
  return {
    ...state,
    phase: 'resolving',
    enemyHp,
    rngSeed: seed,
    writes,
    lastOutcome: {
      kind: 'hit',
      char: prompt.cellCount === 1 ? (written[0]?.candidates[0]?.char ?? null) : null,
      damage: totalDamage,
      critical: anyCritical,
      effectiveness: effect,
      message: messages.join(' '),
    },
    log: withLog(state, ...messages, `${totalDamage} のダメージ！`),
  };
}
