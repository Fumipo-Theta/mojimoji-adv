import {
  battleReducer,
  createBattle,
  createRecord,
  getEnemy,
  recordWrite,
  type BattleAction,
  type BattleSettings,
  type BattleState,
  type MojimonRecord,
} from '@mojimoji/core';
import type { EventBus } from '@mojimoji/protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadLocal, saveLocal, syncToServer, toRecordMap, type SaveData } from '../storage.js';

/** 演出の尺。認識器の typicalLatencyMs とは別に、見せ場として確保する時間 */
const RESOLVE_ANIMATION_MS = 900;
const ENEMY_TURN_ANIMATION_MS = 700;

export interface BattleSession {
  readonly state: BattleState;
  readonly save: SaveData;
  readonly records: ReadonlyMap<string, MojimonRecord>;
  readonly dispatch: (action: BattleAction) => void;
  readonly restart: (enemyId: string) => void;
}

/**
 * display 側のゲーム進行。
 *
 * バトルの状態はここ（＝表示端末）だけが持つ。scanner 端末は
 * 「何を書けばいいか」を受け取って「認識結果」を返すだけの入力装置に徹するので、
 * 通信が切れてもゲームの状態は失われない。
 */
export function useBattleSession(bus: EventBus, initialEnemyId: string, settings?: BattleSettings): BattleSession {
  const [save, setSave] = useState<SaveData>(loadLocal);
  const records = useMemo(() => toRecordMap(save), [save]);

  // reducer は常に最新の記録を見る必要があるが、依存に入れると再購読が走るので ref で渡す
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const [state, setState] = useState<BattleState>(() =>
    createBattle({
      enemy: getEnemy(initialEnemyId),
      playerMaxHp: 50,
      records: new Map(),
      ...(settings ? { settings } : {}),
    }),
  );

  const dispatch = useCallback((action: BattleAction) => {
    setState((current) => battleReducer(current, action, recordsRef.current));
  }, []);

  const restart = useCallback(
    (enemyId: string) => {
      setState(
        createBattle({
          enemy: getEnemy(enemyId),
          playerMaxHp: 50,
          records: recordsRef.current,
          ...(settings ? { settings } : {}),
        }),
      );
    },
    [settings],
  );

  // --- scanner からの認識結果を受け取る ---
  useEffect(() => {
    return bus.subscribe((message) => {
      if (message.type !== 'relay') return;
      const payload = message.payload;
      if (payload.type === 'scan.result') {
        dispatch({ type: 'scan', results: payload.cells });
      }
    });
  }, [bus, dispatch]);

  // --- 出題を scanner へ送る ---
  useEffect(() => {
    if (state.phase !== 'awaiting-input') return;
    bus.send({
      type: 'prompt.set',
      kind: state.prompt.kind,
      requiredElement: state.prompt.requiredElement,
      requiredChars: [...state.prompt.requiredChars],
      sealedChars: [...state.prompt.sealedChars],
      cellCount: state.prompt.cellCount,
      hintText: state.prompt.hintText,
      timeLimitMs: state.prompt.timeLimitMs,
    });
  }, [bus, state.phase, state.prompt]);

  // --- 判定結果を scanner へ送る（手元でも当たり外れが分かるように） ---
  const lastOutcome = state.lastOutcome;
  useEffect(() => {
    if (!lastOutcome) return;
    bus.send({
      type: 'feedback',
      accepted: lastOutcome.kind === 'hit',
      kind: lastOutcome.kind,
      message: lastOutcome.message,
    });
  }, [bus, lastOutcome]);

  // --- 演出待ちのあと自動で次のフェーズへ ---
  useEffect(() => {
    if (state.phase !== 'resolving' && state.phase !== 'enemy-turn') return;
    const delay = state.phase === 'resolving' ? RESOLVE_ANIMATION_MS : ENEMY_TURN_ANIMATION_MS;
    const timer = setTimeout(() => dispatch({ type: 'advance' }), delay);
    return () => clearTimeout(timer);
  }, [state.phase, state.turn, state.lastOutcome, dispatch]);

  // --- 制限時間 ---
  useEffect(() => {
    if (state.phase !== 'awaiting-input' || state.remainingMs === null) return;
    const timer = setInterval(() => dispatch({ type: 'tick', deltaMs: 250 }), 250);
    return () => clearInterval(timer);
  }, [state.phase, state.remainingMs === null, dispatch]);

  // --- 書いた文字を記録に反映する ---
  // バトル終了を待たず逐次コミットする。途中でやめても練習が消えないように。
  const committedRef = useRef(0);
  useEffect(() => {
    if (state.writes.length <= committedRef.current) return;
    const fresh = state.writes.slice(committedRef.current);
    committedRef.current = state.writes.length;

    setSave((current) => {
      const next: SaveData = {
        ...current,
        records: { ...current.records },
      };
      for (const write of fresh) {
        const existing = next.records[write.char] ?? createRecord(write.char, Date.now());
        next.records[write.char] = recordWrite(existing, write.confidence, write.quality);
      }
      saveLocal(next);
      void syncToServer(next);
      return next;
    });
  }, [state.writes]);

  // バトルが変わったらコミット位置をリセットする
  useEffect(() => {
    committedRef.current = 0;
  }, [state.enemy.id]);

  // --- ステージクリアの記録 ---
  useEffect(() => {
    if (state.phase !== 'won') return;
    setSave((current) => {
      if (current.clearedStages.includes(state.enemy.id)) return current;
      const next: SaveData = {
        ...current,
        clearedStages: [...current.clearedStages, state.enemy.id],
      };
      saveLocal(next);
      void syncToServer(next);
      return next;
    });
  }, [state.phase, state.enemy.id]);

  return { state, save, records, dispatch, restart };
}
