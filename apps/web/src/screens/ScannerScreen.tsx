import type { EventBus } from '@mojimoji/protocol';
import { useEffect, useState } from 'react';
import { loadLocal, toRecordMap } from '../storage.js';
import { ScannerPanel } from './ScannerPanel.js';

/**
 * 2 台モードのスマホ／タブレット側。
 *
 * ここはゲームの状態を持たない。表示端末から届く「なにを書けばいいか」を見せ、
 * 認識結果を返すだけ。だから通信が切れても表示端末側の進行は失われない。
 */
export function ScannerScreen({
  bus,
  room,
  recognizerId,
}: {
  bus: EventBus;
  room: string;
  recognizerId: string;
}) {
  const [connected, setConnected] = useState(bus.connected);
  // scanner 側は自分のセーブを持たないが、パレットの「何回書いたか」表示に使う
  const [records] = useState(() => toRecordMap(loadLocal()));

  useEffect(() => {
    const timer = setInterval(() => setConnected(bus.connected), 1000);
    return () => clearInterval(timer);
  }, [bus]);

  return (
    <main className="screen screen-scanner">
      <div className="scanner-topbar">
        <span className="room-chip">へや {room}</span>
        <span className={`conn ${connected ? 'conn-ok' : 'conn-ng'}`}>
          {connected ? 'せつぞくちゅう' : 'せつぞく まちなおし…'}
        </span>
      </div>
      <ScannerPanel bus={bus} records={records} recognizerId={recognizerId} />
    </main>
  );
}
