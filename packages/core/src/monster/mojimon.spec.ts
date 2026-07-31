import { describe, expect, it } from 'vitest';
import {
  KATAKANA_UNLOCK_WRITES,
  createRecord,
  deriveMojimon,
  evolutionSource,
  isUnlocked,
  levelOf,
  recordWrite,
  type MojimonRecord,
} from './mojimon.js';

describe('モジモンの育成', () => {
  it('書いた回数でレベルが上がり、伸びは緩やかになる', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(1)).toBe(2);
    expect(levelOf(4)).toBe(3);
    expect(levelOf(9)).toBe(4);
    // 序盤より後半のほうが 1 レベルに必要な回数が多い
    expect(levelOf(100) - levelOf(81)).toBeLessThan(levelOf(9) - levelOf(0));
  });

  it('記入するたびに回数が増え、最高 quality が更新される', () => {
    let record = createRecord('あ', 0);
    record = recordWrite(record, 0.8, 0.4);
    record = recordWrite(record, 0.9, 0.9);
    record = recordWrite(record, 0.7, 0.2);
    expect(record.writeCount).toBe(3);
    expect(record.bestQuality).toBe(0.9);
  });

  it('平均確信度は直近を重く見る', () => {
    let record = createRecord('あ', 0);
    record = recordWrite(record, 0.2, 0);
    const low = record.avgConfidence;
    record = recordWrite(record, 1, 0);
    expect(record.avgConfidence).toBeGreaterThan(low);
    expect(record.avgConfidence).toBeLessThan(1);
  });

  it('レアリティが高い文字ほど攻撃力が高い', () => {
    const hira = deriveMojimon(createRecord('か', 0));
    const daku = deriveMojimon(createRecord('が', 0));
    const kata = deriveMojimon(createRecord('カ', 0));
    expect(daku.power).toBeGreaterThan(hira.power);
    expect(kata.power).toBeGreaterThan(daku.power);
  });

  it('未知の文字ではエラーになる', () => {
    expect(() => deriveMojimon(createRecord('漢', 0))).toThrow();
  });
});

describe('進化の解放条件', () => {
  it('濁音は元の清音から進化する', () => {
    expect(evolutionSource('が')).toBe('か');
    expect(evolutionSource('ぱ')).toBe('は');
    expect(evolutionSource('カ')).toBe('か');
    expect(evolutionSource('か')).toBeNull();
  });

  it('清音は最初から使える', () => {
    expect(isUnlocked('か', new Map())).toBe(true);
  });

  it('濁音は元の字を 1 回書けば解放される', () => {
    const records = new Map<string, MojimonRecord>();
    expect(isUnlocked('が', records)).toBe(false);
    records.set('か', recordWrite(createRecord('か', 0), 0.9, 0.5));
    expect(isUnlocked('が', records)).toBe(true);
  });

  it('カタカナは元のひらがなを規定回数書くまで解放されない', () => {
    const records = new Map<string, MojimonRecord>();
    let record = createRecord('か', 0);
    for (let i = 0; i < KATAKANA_UNLOCK_WRITES - 1; i++) {
      record = recordWrite(record, 0.9, 0.5);
    }
    records.set('か', record);
    expect(isUnlocked('カ', records)).toBe(false);

    records.set('か', recordWrite(record, 0.9, 0.5));
    expect(isUnlocked('カ', records)).toBe(true);
  });
});
