import type { EnemyDef } from '../battle/types.js';

/**
 * 敵「モジケシ」— 文字を消してしまう者たち。
 * 属性は「その敵に有効な行」を決めるので、ステージ配置がそのまま
 * 「今日どの行を練習するか」の設計になる。
 */
export const ENEMIES: readonly EnemyDef[] = [
    {
        id: 'keshi-fire',
        name: 'ヒケシ',
        element: 'ほのお', // 弱点は みず ＝ さ行
        maxHp: 40,
        attack: 6,
        promptKind: 'element',
    },
    {
        id: 'keshi-water',
        name: 'ミズケシ',
        element: 'みず', // 弱点は でんき ＝ や行
        maxHp: 45,
        attack: 7,
        promptKind: 'element',
    },
    {
        id: 'keshi-grass',
        name: 'クサケシ',
        element: 'くさ', // 弱点は ほのお ＝ か行
        maxHp: 50,
        attack: 7,
        promptKind: 'element',
    },
    {
        id: 'keshi-dark',
        name: 'ヤミケシ',
        element: 'やみ', // 弱点は ひかり ＝ あ行
        maxHp: 55,
        attack: 8,
        promptKind: 'exact',
    },
    {
        id: 'keshi-earth',
        name: 'ツチケシ',
        element: 'つち', // 弱点は くさ ＝ な行
        maxHp: 60,
        attack: 8,
        promptKind: 'exact',
        sealedChars: ['な'], // 一番書きやすい字を封じて、他の字を使わせる
    },
    {
        id: 'boss-mojikui',
        name: 'モジクイ',
        element: 'やみ',
        maxHp: 120,
        attack: 10,
        promptKind: 'word',
        words: ['たいよう', 'そら', 'ほし', 'うみ', 'やま'],
    },
];

export function getEnemy(id: string): EnemyDef {
    const enemy = ENEMIES.find((e) => e.id === id);
    if (!enemy) throw new Error(`未知の敵です: ${id}`);
    return enemy;
}
