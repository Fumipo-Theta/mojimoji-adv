import { ENEMIES } from '@mojimoji/core';
import type { EventBus } from '@mojimoji/protocol';
import { useEffect, useState } from 'react';
import { BattleStage } from '../components/BattleStage.js';
import { Zukan } from '../components/Zukan.js';
import { useBattleSession } from '../hooks/useBattleSession.js';
import { scannerUrl } from '../session.js';
import { ScannerPanel } from './ScannerPanel.js';

type Tab = 'battle' | 'zukan';

/**
 * ゲーム画面（PC + ディスプレイ、または 1 台モードのメイン画面）。
 * バトルの状態を持つのはこの画面だけ。
 */
export function DisplayScreen({
  bus,
  room,
  solo,
  recognizerId,
}: {
  bus: EventBus;
  room: string;
  solo: boolean;
  recognizerId: string;
}) {
  const [enemyId, setEnemyId] = useState(ENEMIES[0]?.id ?? 'keshi-fire');
  const [tab, setTab] = useState<Tab>('battle');
  const session = useBattleSession(bus, enemyId);
  const { state, dispatch, restart, records, save } = session;

  // イントロは自動で進める。子供に余計なタップをさせない
  useEffect(() => {
    if (state.phase !== 'intro') return;
    const timer = setTimeout(() => dispatch({ type: 'start' }), 600);
    return () => clearTimeout(timer);
  }, [state.phase, dispatch]);

  const chooseEnemy = (id: string): void => {
    setEnemyId(id);
    restart(id);
    setTab('battle');
  };

  return (
    <main className="screen screen-display">
      <nav className="topnav">
        <h1>もじもじアドベンチャー</h1>
        <div className="topnav-tabs">
          <button type="button" className={tab === 'battle' ? 'active' : ''} onClick={() => setTab('battle')}>
            バトル
          </button>
          <button type="button" className={tab === 'zukan' ? 'active' : ''} onClick={() => setTab('zukan')}>
            ずかん
          </button>
        </div>
        {!solo && <RoomInvite room={room} />}
      </nav>

      {tab === 'zukan' ? (
        <Zukan records={records} />
      ) : (
        <>
          <BattleStage state={state} />

          <div className="stage-actions">
            {(state.phase === 'won' || state.phase === 'lost') && (
              <button type="button" className="primary" onClick={() => restart(enemyId)}>
                もういちど
              </button>
            )}
          </div>

          <div className="enemy-picker">
            <span>あいて をえらぶ</span>
            {ENEMIES.map((enemy) => (
              <button
                key={enemy.id}
                type="button"
                className={`${enemy.id === enemyId ? 'active' : ''} ${
                  save.clearedStages.includes(enemy.id) ? 'cleared' : ''
                }`}
                onClick={() => chooseEnemy(enemy.id)}
              >
                {enemy.name}
                {save.clearedStages.includes(enemy.id) && <span className="clear-mark">★</span>}
              </button>
            ))}
          </div>

          {solo && (
            <ScannerPanel bus={bus} records={records} recognizerId={recognizerId} compact />
          )}
        </>
      )}
    </main>
  );
}

/** 2 台モードで、スマホをつなぐための案内 */
function RoomInvite({ room }: { room: string }) {
  const url = scannerUrl(room);
  return (
    <div className="room-invite">
      <div className="room-code" aria-label="ルームコード">
        {room}
      </div>
      <div className="room-hint">
        スマホで ひらく:
        <code>{url}</code>
      </div>
    </div>
  );
}
