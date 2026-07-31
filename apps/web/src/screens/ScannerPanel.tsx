import type { MojimonRecord } from '@mojimoji/core';
import type { EventBus } from '@mojimoji/protocol';
import { KanaPalette } from '../components/KanaPalette.js';
import { useScannerSession } from '../hooks/useScannerSession.js';

/**
 * スキャナ側の画面。
 *
 * 1 台モードではバトル画面の下に並び、2 台モードではスマホ側の全画面になる。
 * どちらも同じコンポーネント・同じ EventBus 越しの通信で、分岐は無い。
 */
export function ScannerPanel({
  bus,
  records,
  recognizerId,
  compact,
}: {
  bus: EventBus;
  records: ReadonlyMap<string, MojimonRecord>;
  recognizerId: string;
  compact?: boolean;
}) {
  const session = useScannerSession(bus, recognizerId);
  const prompt = session.prompt;

  return (
    <section className={`scanner ${compact ? 'scanner-compact' : ''}`}>
      {!compact && (
        <header className="scanner-header">
          <h2>{prompt?.hintText ?? 'ゲームがはじまるのを まっています…'}</h2>
          {session.feedback && (
            <p className={`scanner-feedback ${session.feedback.accepted ? 'ok' : 'ng'}`}>
              {session.feedback.message}
            </p>
          )}
        </header>
      )}

      <div className="scanner-mode-note">
        <strong>ダミー入力モード</strong>
        <span>
          カメラ実装（M3）が入るまでの仮入力です。したの ひょうから もじを えらぶと、
          「かみに かいた」ことになります。
        </span>
      </div>

      {!session.ready ? (
        <p className="scanner-loading">よみとりの じゅんびちゅう…</p>
      ) : !prompt ? (
        <p className="scanner-loading">おだいを まっています…</p>
      ) : (
        <KanaPalette
          records={records}
          cellCount={prompt.cellCount}
          sealedChars={prompt.sealedChars}
          disabled={session.busy}
          onSubmit={(chars) => void session.submit(chars)}
        />
      )}
    </section>
  );
}
