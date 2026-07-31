import type { CellResult } from '@mojimoji/recognition';
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../data/enemies.js';
import { createRecord, recordWrite, type MojimonRecord } from '../monster/mojimon.js';
import { battleReducer, computeDamage, createBattle } from './reducer.js';
import { DEFAULT_BATTLE_SETTINGS, type BattleState } from './types.js';

const NO_RECORDS = new Map<string, MojimonRecord>();

function scan(chars: readonly string[], confidence = 0.9, quality = 0.5): CellResult[] {
  return chars.map((char, index) => ({
    index,
    candidates: [{ char, confidence }],
    quality,
  }));
}

/** 演出待ちを飛ばして次の入力受付まで進める */
function settle(state: BattleState, records = NO_RECORDS): BattleState {
  let next = state;
  let guard = 0;
  while (next.phase === 'resolving' || next.phase === 'enemy-turn') {
    next = battleReducer(next, { type: 'advance' }, records);
    if (++guard > 10) throw new Error('advance が収束しませんでした');
  }
  return next;
}

function startBattle(enemyId = 'keshi-fire', overrides: Partial<BattleState> = {}): BattleState {
  const base = createBattle({
    enemy: getEnemy(enemyId),
    playerMaxHp: 50,
    records: NO_RECORDS,
    seed: 7,
  });
  return { ...battleReducer(base, { type: 'start' }, NO_RECORDS), ...overrides };
}

describe('バトルの進行', () => {
  it('start で入力受付に入る', () => {
    const state = startBattle();
    expect(state.phase).toBe('awaiting-input');
    expect(state.enemyHp).toBe(state.enemy.maxHp);
  });

  it('弱点属性の文字でダメージが入る', () => {
    const state = startBattle('keshi-fire'); // ほのお = 弱点 みず = さ行
    expect(state.prompt.requiredElement).toBe('みず');
    const after = battleReducer(state, { type: 'scan', results: scan(['さ']) }, NO_RECORDS);
    expect(after.lastOutcome?.kind).toBe('hit');
    expect(after.lastOutcome?.effectiveness).toBe(2);
    expect(after.enemyHp).toBeLessThan(state.enemyHp);
  });

  it('属性違いの文字ではダメージが入らず、何を書いたか教えてくれる', () => {
    const state = startBattle('keshi-fire');
    const after = battleReducer(state, { type: 'scan', results: scan(['か']) }, NO_RECORDS);
    expect(after.lastOutcome?.kind).toBe('wrong-char');
    expect(after.enemyHp).toBe(state.enemyHp);
    expect(after.lastOutcome?.message).toContain('か');
  });

  it('確信度が低い結果は「読み取れなかった」として書き直させる', () => {
    const state = startBattle('keshi-fire');
    const after = battleReducer(state, { type: 'scan', results: scan(['さ'], 0.1) }, NO_RECORDS);
    expect(after.lastOutcome?.kind).toBe('unreadable');
    expect(after.enemyHp).toBe(state.enemyHp);
  });

  it('封印された文字は使えない', () => {
    const state = startBattle('keshi-earth'); // 'な' が封印されている
    const after = battleReducer(state, { type: 'scan', results: scan(['な']) }, NO_RECORDS);
    expect(after.lastOutcome?.kind).toBe('sealed');
    expect(after.enemyHp).toBe(state.enemyHp);
  });

  it('既定設定では失敗しても HP が減らない（失敗を罰しない）', () => {
    const state = startBattle('keshi-fire');
    const wrong = battleReducer(state, { type: 'scan', results: scan(['か']) }, NO_RECORDS);
    const settled = settle(wrong);
    expect(settled.playerHp).toBe(state.playerHp);
    expect(settled.phase).toBe('awaiting-input');
  });

  it('punishMistakes を有効にすると失敗時に敵が攻撃してくる', () => {
    const state = startBattle('keshi-fire', {
      settings: { ...DEFAULT_BATTLE_SETTINGS, punishMistakes: true },
    });
    const wrong = battleReducer(state, { type: 'scan', results: scan(['か']) }, NO_RECORDS);
    const settled = settle(wrong);
    expect(settled.playerHp).toBeLessThan(state.playerHp);
  });

  it('成功したあとは敵のターンを経て次の出題に進む', () => {
    const state = startBattle('keshi-fire');
    const hit = battleReducer(state, { type: 'scan', results: scan(['さ']) }, NO_RECORDS);
    const settled = settle(hit);
    expect(settled.playerHp).toBeLessThan(state.playerHp);
    expect(settled.turn).toBe(state.turn + 1);
    expect(settled.phase).toBe('awaiting-input');
  });

  it('敵の HP を削り切ると勝利する', () => {
    let state = startBattle('keshi-fire');
    for (let i = 0; i < 30 && state.phase === 'awaiting-input'; i++) {
      state = battleReducer(state, { type: 'scan', results: scan(['さ']) }, NO_RECORDS);
      state = settle(state);
    }
    expect(state.phase).toBe('won');
    expect(state.enemyHp).toBe(0);
  });

  it('プレイヤーの HP が尽きると敗北する', () => {
    let state = startBattle('keshi-fire', { playerHp: 6 });
    state = battleReducer(state, { type: 'scan', results: scan(['さ']) }, NO_RECORDS);
    state = settle(state);
    expect(state.phase).toBe('lost');
  });

  it('勝敗がついた後はスキャンを受け付けない', () => {
    const won: BattleState = { ...startBattle(), phase: 'won' };
    expect(battleReducer(won, { type: 'scan', results: scan(['さ']) }, NO_RECORDS)).toBe(won);
  });
});

describe('単語バトル（ボス）', () => {
  it('必要な文字数が揃うまで判定を保留する', () => {
    const state = startBattle('boss-mojikui');
    expect(state.prompt.kind).toBe('word');
    expect(state.prompt.cellCount).toBeGreaterThan(1);

    const partial = battleReducer(state, { type: 'scan', results: scan(['そ']) }, NO_RECORDS);
    expect(partial.lastOutcome?.kind).toBe('blank');
    expect(partial.enemyHp).toBe(state.enemyHp);
  });

  it('正しい語を全マス書くとまとめてダメージが入る', () => {
    const state = startBattle('boss-mojikui');
    const word = state.prompt.requiredChars;
    const after = battleReducer(state, { type: 'scan', results: scan(word) }, NO_RECORDS);
    expect(after.lastOutcome?.kind).toBe('hit');
    expect(after.enemyHp).toBeLessThan(state.enemyHp);
  });

  it('1 文字でも違うと不正解になる', () => {
    const state = startBattle('boss-mojikui');
    const word = [...state.prompt.requiredChars];
    word[word.length - 1] = word.at(-1) === 'ん' ? 'あ' : 'ん';
    const after = battleReducer(state, { type: 'scan', results: scan(word) }, NO_RECORDS);
    expect(after.lastOutcome?.kind).toBe('wrong-char');
    expect(after.enemyHp).toBe(state.enemyHp);
  });
});

describe('制限時間', () => {
  it('無制限設定では tick しても何も起きない', () => {
    const state = startBattle();
    expect(state.remainingMs).toBeNull();
    expect(battleReducer(state, { type: 'tick', deltaMs: 10_000 }, NO_RECORDS)).toBe(state);
  });

  it('時間切れでは HP を減らさず、出題し直す', () => {
    const state = startBattle('keshi-fire', {
      settings: { ...DEFAULT_BATTLE_SETTINGS, timeLimitMs: 5_000 },
      remainingMs: 5_000,
    });
    const after = battleReducer(state, { type: 'tick', deltaMs: 6_000 }, NO_RECORDS);
    expect(after.playerHp).toBe(state.playerHp);
    expect(after.remainingMs).toBe(5_000);
    expect(after.log.at(-1)).toContain('じかんぎれ');
  });
});

describe('書いた記録', () => {
  it('出題と違う文字でも「書けた」記録として残る（練習を無駄にしない）', () => {
    const state = startBattle('keshi-fire');
    const after = battleReducer(state, { type: 'scan', results: scan(['か']) }, NO_RECORDS);
    expect(after.writes.map((w) => w.char)).toContain('か');
  });

  it('読み取れなかった場合は記録しない', () => {
    const state = startBattle('keshi-fire');
    const after = battleReducer(state, { type: 'scan', results: scan(['さ'], 0.1) }, NO_RECORDS);
    expect(after.writes).toHaveLength(0);
  });
});

describe('ダメージ計算', () => {
  const params = {
    char: 'さ',
    confidence: 1,
    quality: 0,
    enemyElement: 'ほのお' as const,
    records: NO_RECORDS,
    rngSeed: 1,
  };

  it('確信度が高いほどダメージが大きい', () => {
    const low = computeDamage({ ...params, confidence: 0.5 });
    const high = computeDamage({ ...params, confidence: 1 });
    expect(high.damage).toBeGreaterThan(low.damage);
  });

  it('弱点属性なら等倍より大きい', () => {
    const weak = computeDamage(params); // みず → ほのお = 2倍
    const neutral = computeDamage({ ...params, char: 'あ' }); // ひかり → ほのお = 等倍
    expect(weak.damage).toBeGreaterThan(neutral.damage);
  });

  it('レベルが上がるとダメージが増える', () => {
    let record = createRecord('さ', 0);
    for (let i = 0; i < 16; i++) record = recordWrite(record, 0.9, 0.9);
    const leveled = computeDamage({ ...params, records: new Map([['さ', record]]) });
    const fresh = computeDamage(params);
    expect(leveled.damage).toBeGreaterThan(fresh.damage);
  });

  it('同じシードなら常に同じ結果になる（リプレイ可能性）', () => {
    const a = computeDamage({ ...params, quality: 1 });
    const b = computeDamage({ ...params, quality: 1 });
    expect(a).toEqual(b);
  });

  it('ダメージは必ず 1 以上', () => {
    const result = computeDamage({ ...params, char: 'か', confidence: 0 });
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });
});
