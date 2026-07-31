import { describe, expect, it } from 'vitest';
import {
  ROWS,
  allChars,
  charsOfKind,
  charsOfRow,
  effectiveness,
  getCharMeta,
  toHiragana,
  toKatakana,
  weaknessOf,
} from './kana.js';

describe('五十音メタデータ', () => {
  it('清音のひらがなが 46 字ある', () => {
    expect(charsOfKind('seion')).toHaveLength(46);
  });

  it('濁音 20 字・半濁音 5 字を持つ', () => {
    expect(charsOfKind('dakuon')).toHaveLength(20);
    expect(charsOfKind('handakuon')).toHaveLength(5);
  });

  it('カタカナは清音・濁音・半濁音すべてに対応する 71 字', () => {
    expect(charsOfKind('katakana')).toHaveLength(46 + 20 + 5);
  });

  it('全行の属性が重複しない', () => {
    const elements = ROWS.map((r) => r.element);
    expect(new Set(elements).size).toBe(ROWS.length);
  });

  it('濁音は元の清音と同じ行・属性を継ぐ', () => {
    const ga = getCharMeta('が');
    const ka = getCharMeta('か');
    expect(ga?.row).toBe(ka?.row);
    expect(ga?.element).toBe(ka?.element);
    expect(ga?.base).toBe('か');
  });

  it('レアリティが 清音 < 濁音 < カタカナ の順になる', () => {
    expect(getCharMeta('か')?.rarity).toBe(1);
    expect(getCharMeta('が')?.rarity).toBe(2);
    expect(getCharMeta('カ')?.rarity).toBe(3);
  });

  it('ひらがな↔カタカナの変換が往復する', () => {
    for (const char of charsOfKind('seion', 'dakuon', 'handakuon')) {
      expect(toHiragana(toKatakana(char))).toBe(char);
    }
  });

  it('charsOfRow は濁音・カタカナも含む', () => {
    const ka = charsOfRow('ka');
    expect(ka).toContain('か');
    expect(ka).toContain('が');
    expect(ka).toContain('カ');
    expect(ka).not.toContain('さ');
  });

  it('全文字が一意で、メタデータを引ける', () => {
    const chars = allChars();
    expect(new Set(chars).size).toBe(chars.length);
    expect(chars.every((c) => getCharMeta(c) !== undefined)).toBe(true);
  });
});

describe('属性相性', () => {
  it('弱点属性で攻撃すると 2 倍になる', () => {
    // ほのお の弱点は みず
    expect(weaknessOf('ほのお')).toBe('みず');
    expect(effectiveness('みず', 'ほのお')).toBe(2);
  });

  it('逆方向は 0.5 倍になる', () => {
    expect(effectiveness('ほのお', 'みず')).toBe(0.5);
  });

  it('関係のない組み合わせは等倍', () => {
    expect(effectiveness('ひかり', 'みず')).toBe(1);
  });

  it('すべての属性に弱点が定義されている', () => {
    for (const row of ROWS) {
      expect(weaknessOf(row.element)).toBeDefined();
    }
  });
});
