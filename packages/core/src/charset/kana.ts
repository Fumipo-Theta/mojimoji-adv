/**
 * 五十音表のメタデータ。
 *
 * ゲームデザイン上の中心。「行 = 属性」「文字種 = レアリティ」という対応で、
 * 五十音表そのものが図鑑の画面になり、覚えることと集めることが一致する。
 */

/** モジモンの属性。行と 1:1 対応させて覚えやすくしている */
export type Element =
  | 'ひかり'
  | 'ほのお'
  | 'みず'
  | 'つち'
  | 'くさ'
  | 'かぜ'
  | 'やみ'
  | 'でんき'
  | 'こおり'
  | 'ほし';

/** 行の識別子 */
export type RowId = 'a' | 'ka' | 'sa' | 'ta' | 'na' | 'ha' | 'ma' | 'ya' | 'ra' | 'wa';

/** レアリティ。文字種の難しさがそのまま強さになる（漢字拡張の受け皿） */
export type Rarity = 1 | 2 | 3 | 4 | 5;

export type CharKind = 'seion' | 'dakuon' | 'handakuon' | 'katakana' | 'word' | 'kanji';

export interface RowDef {
  readonly id: RowId;
  readonly label: string;
  readonly element: Element;
  /** 清音のひらがな */
  readonly chars: readonly string[];
}

export const ROWS: readonly RowDef[] = [
  { id: 'a', label: 'あ行', element: 'ひかり', chars: ['あ', 'い', 'う', 'え', 'お'] },
  { id: 'ka', label: 'か行', element: 'ほのお', chars: ['か', 'き', 'く', 'け', 'こ'] },
  { id: 'sa', label: 'さ行', element: 'みず', chars: ['さ', 'し', 'す', 'せ', 'そ'] },
  { id: 'ta', label: 'た行', element: 'つち', chars: ['た', 'ち', 'つ', 'て', 'と'] },
  { id: 'na', label: 'な行', element: 'くさ', chars: ['な', 'に', 'ぬ', 'ね', 'の'] },
  { id: 'ha', label: 'は行', element: 'かぜ', chars: ['は', 'ひ', 'ふ', 'へ', 'ほ'] },
  { id: 'ma', label: 'ま行', element: 'やみ', chars: ['ま', 'み', 'む', 'め', 'も'] },
  { id: 'ya', label: 'や行', element: 'でんき', chars: ['や', 'ゆ', 'よ'] },
  { id: 'ra', label: 'ら行', element: 'こおり', chars: ['ら', 'り', 'る', 'れ', 'ろ'] },
  { id: 'wa', label: 'わ行', element: 'ほし', chars: ['わ', 'を', 'ん'] },
];

/** 清音 → 濁音 */
const DAKUON: Readonly<Record<string, string>> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};

/** 清音 → 半濁音 */
const HANDAKUON: Readonly<Record<string, string>> = {
  は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ',
};

/** ひらがな → カタカナ の Unicode オフセット */
const KATAKANA_OFFSET = 0x60;

export function toKatakana(hiragana: string): string {
  return [...hiragana]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      // ぁ(U+3041) 〜 ゖ(U+3096) の範囲だけ変換する
      return code >= 0x3041 && code <= 0x3096
        ? String.fromCodePoint(code + KATAKANA_OFFSET)
        : ch;
    })
    .join('');
}

export function toHiragana(katakana: string): string {
  return [...katakana]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x30a1 && code <= 0x30f6
        ? String.fromCodePoint(code - KATAKANA_OFFSET)
        : ch;
    })
    .join('');
}

export interface CharMeta {
  readonly char: string;
  /** 対応する清音のひらがな。図鑑上の並び位置と属性はこれで決まる */
  readonly base: string;
  readonly reading: string;
  readonly row: RowId;
  readonly element: Element;
  readonly kind: CharKind;
  readonly rarity: Rarity;
}

function rarityOf(kind: CharKind): Rarity {
  switch (kind) {
    case 'seion':
      return 1;
    case 'dakuon':
    case 'handakuon':
      return 2;
    case 'katakana':
      return 3;
    case 'word':
      return 4;
    case 'kanji':
      return 5;
  }
}

function buildCharTable(): Map<string, CharMeta> {
  const table = new Map<string, CharMeta>();
  const add = (char: string, base: string, row: RowDef, kind: CharKind): void => {
    table.set(char, {
      char,
      base,
      reading: char,
      row: row.id,
      element: row.element,
      kind,
      rarity: rarityOf(kind),
    });
  };

  for (const row of ROWS) {
    for (const seion of row.chars) {
      add(seion, seion, row, 'seion');

      const dakuon = DAKUON[seion];
      if (dakuon) add(dakuon, seion, row, 'dakuon');

      const handakuon = HANDAKUON[seion];
      if (handakuon) add(handakuon, seion, row, 'handakuon');

      // カタカナは清音・濁音・半濁音すべてに対応するものを登録する
      for (const kana of [seion, dakuon, handakuon]) {
        if (!kana) continue;
        add(toKatakana(kana), seion, row, 'katakana');
      }
    }
  }
  return table;
}

const CHAR_TABLE = buildCharTable();

export function getCharMeta(char: string): CharMeta | undefined {
  return CHAR_TABLE.get(char);
}

export function isKnownChar(char: string): boolean {
  return CHAR_TABLE.has(char);
}

/** 全対応文字。認識器の既定 charset にも使う */
export function allChars(): readonly string[] {
  return [...CHAR_TABLE.keys()];
}

export function charsOfKind(...kinds: readonly CharKind[]): readonly string[] {
  return [...CHAR_TABLE.values()].filter((m) => kinds.includes(m.kind)).map((m) => m.char);
}

/** 指定した行に属する文字すべて（濁音・カタカナを含む） */
export function charsOfRow(row: RowId): readonly string[] {
  return [...CHAR_TABLE.values()].filter((m) => m.row === row).map((m) => m.char);
}

export interface CharGroup {
  readonly kind: CharKind;
  readonly label: string;
  readonly chars: readonly string[];
}

const GROUP_ORDER: readonly { kind: CharKind; label: string }[] = [
  { kind: 'seion', label: 'せいおん' },
  { kind: 'dakuon', label: 'だくおん' },
  { kind: 'handakuon', label: 'はんだくおん' },
  { kind: 'katakana', label: 'カタカナ' },
];

/**
 * 図鑑表示用に、行の文字を種別ごとの段に分ける。
 *
 * 清音とカタカナが交互に並ぶと五十音表として読めなくなるので、
 * 「せいおん」「だくおん」「カタカナ」を別の段にする。
 * 覚える順序（清音 → 濁音 → カタカナ）とも一致する。
 */
export function charsOfRowGrouped(row: RowId): readonly CharGroup[] {
  const metas = [...CHAR_TABLE.values()].filter((m) => m.row === row);
  const groups: CharGroup[] = [];
  for (const { kind, label } of GROUP_ORDER) {
    const chars = metas.filter((m) => m.kind === kind).map((m) => m.char);
    if (chars.length > 0) groups.push({ kind, label, chars });
  }
  return groups;
}

export function getRow(row: RowId): RowDef {
  const found = ROWS.find((r) => r.id === row);
  if (!found) throw new Error(`未知の行: ${row}`);
  return found;
}

export function elementOfRow(row: RowId): Element {
  return getRow(row).element;
}

/**
 * 属性相性。弱点は 2.0、耐性は 0.5 倍。
 * 子供が覚えられるよう「1 属性につき弱点 1 つ」の単純な循環にしている。
 */
const WEAKNESS: Readonly<Record<Element, Element>> = {
  ほのお: 'みず',   // 火は水に弱い
  みず: 'でんき',   // 水は電気に弱い
  でんき: 'つち',   // 電気は土に弱い
  つち: 'くさ',     // 土は草に弱い
  くさ: 'ほのお',   // 草は火に弱い
  かぜ: 'こおり',   // 風は氷に弱い
  こおり: 'かぜ',   // 氷は風に弱い
  ひかり: 'やみ',   // 光は闇に弱い
  やみ: 'ひかり',   // 闇は光に弱い
  ほし: 'ほし',     // 星は星にのみ弱い（特殊枠）
};

/** attacker が defender を攻撃したときの倍率 */
export function effectiveness(attacker: Element, defender: Element): number {
  if (WEAKNESS[defender] === attacker) return 2;
  if (WEAKNESS[attacker] === defender) return 0.5;
  return 1;
}

/** ある属性の弱点属性（＝その属性の敵に有効な属性） */
export function weaknessOf(element: Element): Element {
  return WEAKNESS[element];
}
