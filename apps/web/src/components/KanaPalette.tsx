import { ROWS, getCharMeta, isUnlocked, type MojimonRecord } from '@mojimoji/core';
import { useState } from 'react';

/**
 * ダミー認識の入力装置。
 *
 * 「紙に書く」の代わりに画面から文字を選ぶ。M1 でゲームループを完成させるための
 * 仮の入力で、カメラ実装が入ったらこの画面はデバッグ用に格下げになる。
 * 五十音表の形にしてあるので、そのまま図鑑 UI の骨格としても再利用できる。
 */
export function KanaPalette({
  records,
  cellCount,
  sealedChars,
  disabled,
  onSubmit,
}: {
  records: ReadonlyMap<string, MojimonRecord>;
  cellCount: number;
  sealedChars: readonly string[];
  disabled: boolean;
  onSubmit: (chars: readonly string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);

  const pick = (char: string): void => {
    if (disabled) return;
    const next = [...picked, char].slice(-cellCount);
    setPicked(next);
    if (next.length === cellCount) {
      onSubmit(next);
      setPicked([]);
    }
  };

  return (
    <div className="palette">
      <div className="palette-slots" aria-label="かいたもじ">
        {Array.from({ length: cellCount }, (_, i) => (
          <span key={i} className={`slot ${picked[i] ? 'slot-filled' : ''}`}>
            {picked[i] ?? ''}
          </span>
        ))}
        {picked.length > 0 && (
          <button type="button" className="slot-clear" onClick={() => setPicked([])}>
            けす
          </button>
        )}
      </div>

      <div className="palette-grid">
        {ROWS.map((row) => (
          <div key={row.id} className="palette-row">
            <span className={`row-label element-${row.element}`}>{row.label}</span>
            {row.chars.map((char) => {
              const meta = getCharMeta(char);
              const sealed = sealedChars.includes(char);
              const unlocked = isUnlocked(char, records);
              const count = records.get(char)?.writeCount ?? 0;
              return (
                <button
                  key={char}
                  type="button"
                  className={`kana ${sealed ? 'kana-sealed' : ''} ${count > 0 ? 'kana-known' : ''}`}
                  disabled={disabled || sealed || !unlocked}
                  onClick={() => pick(char)}
                  title={
                    sealed
                      ? `「${char}」はふういんされている`
                      : `${char}（${meta?.element}）${count > 0 ? ` ・${count}かい` : ''}`
                  }
                >
                  {char}
                  {count > 0 && <span className="kana-count">{count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
