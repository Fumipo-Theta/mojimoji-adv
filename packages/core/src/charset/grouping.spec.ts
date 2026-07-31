import { describe, expect, it } from 'vitest';
import { ROWS, charsOfRow, charsOfRowGrouped, getCharMeta } from './kana.js';

describe('図鑑用のグルーピング', () => {
  it('段は せいおん → だくおん → はんだくおん → カタカナ の順になる', () => {
    const groups = charsOfRowGrouped('ha');
    expect(groups.map((g) => g.kind)).toEqual(['seion', 'dakuon', 'handakuon', 'katakana']);
  });

  it('半濁音を持たない行には はんだくおん の段が出ない', () => {
    expect(charsOfRowGrouped('ka').map((g) => g.kind)).toEqual(['seion', 'dakuon', 'katakana']);
  });

  it('濁音を持たない行は せいおん と カタカナ だけ', () => {
    expect(charsOfRowGrouped('a').map((g) => g.kind)).toEqual(['seion', 'katakana']);
  });

  it('各段の文字は同じ種別で揃っている', () => {
    for (const row of ROWS) {
      for (const group of charsOfRowGrouped(row.id)) {
        expect(group.chars.every((c) => getCharMeta(c)?.kind === group.kind)).toBe(true);
      }
    }
  });

  it('グルーピングしても行の文字を取りこぼさない', () => {
    for (const row of ROWS) {
      const flattened = charsOfRowGrouped(row.id).flatMap((g) => g.chars);
      expect(new Set(flattened)).toEqual(new Set(charsOfRow(row.id)));
    }
  });
});
