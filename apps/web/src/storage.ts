import type { MojimonRecord } from '@mojimoji/core';

/**
 * セーブデータ。
 *
 * 保存するのは文字ごとの記入回数とスコアだけ。画像は保存しない。
 * まず localStorage に即時保存し、ローカルサーバーにも非同期でミラーする
 * （端末を変えても続きから遊べるように）。どちらもこの家の中で完結する。
 */
export interface SaveData {
  records: Record<string, MojimonRecord>;
  clearedStages: string[];
}

const KEY = 'mojimoji-adv.save.v1';

export function emptySave(): SaveData {
  return { records: {}, clearedStages: [] };
}

export function loadLocal(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as SaveData;
    return { records: parsed.records ?? {}, clearedStages: parsed.clearedStages ?? [] };
  } catch {
    return emptySave();
  }
}

export function saveLocal(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 容量超過などは黙って諦める。ゲームは続行できる
  }
}

export async function syncToServer(data: SaveData): Promise<void> {
  try {
    await fetch('/api/save', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    // サーバーが落ちていても localStorage があるので進行に影響はない
  }
}

export function toRecordMap(data: SaveData): Map<string, MojimonRecord> {
  return new Map(Object.entries(data.records));
}
