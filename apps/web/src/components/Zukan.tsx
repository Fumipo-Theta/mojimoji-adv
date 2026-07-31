import {
  ROWS,
  charsOfRowGrouped,
  deriveMojimon,
  getCharMeta,
  isUnlocked,
  type MojimonRecord,
} from '@mojimoji/core';

/**
 * モジモン図鑑。
 *
 * 五十音表がそのまま図鑑の形になっているのが設計の要。
 * 「表が埋まっていく」ことが、覚えた文字が増えたことの可視化になる。
 * 段は せいおん → だくおん → カタカナ の順で、覚える順序と一致させている。
 */
export function Zukan({ records }: { records: ReadonlyMap<string, MojimonRecord> }) {
  const discovered = [...records.values()].filter((r) => r.writeCount > 0);

  return (
    <section className="zukan">
      <h2>
        もじモンずかん
        <span className="zukan-count">{discovered.length} たい</span>
      </h2>

      {ROWS.map((row) => (
        <div key={row.id} className="zukan-row">
          <span className={`row-label element-${row.element}`}>
            {row.label}
            <em>{row.element}</em>
          </span>
          <div className="zukan-groups">
            {charsOfRowGrouped(row.id).map((group) => (
              <div key={group.kind} className="zukan-group">
                <span className="zukan-group-label">{group.label}</span>
                <div className="zukan-cells">
                  {group.chars.map((char) => (
                    <ZukanCell key={char} char={char} records={records} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ZukanCell({
  char,
  records,
}: {
  char: string;
  records: ReadonlyMap<string, MojimonRecord>;
}) {
  const record = records.get(char);
  const meta = getCharMeta(char);
  const known = (record?.writeCount ?? 0) > 0;
  const unlocked = isUnlocked(char, records);
  const mojimon = record && known ? deriveMojimon(record) : null;

  return (
    <div
      className={`zukan-cell rarity-${meta?.rarity ?? 1} ${
        known ? 'known' : unlocked ? 'unlocked' : 'locked'
      }`}
      title={
        mojimon
          ? `${char} Lv.${mojimon.level} / ちから ${mojimon.power} / うつくしさ ${Math.round(
              mojimon.beauty * 100,
            )}`
          : unlocked
            ? `${char}（まだ かいていない）`
            : `${char}（もとの もじを かくと あらわれる）`
      }
    >
      <span className="zukan-char">{known || unlocked ? char : '？'}</span>
      {mojimon && <span className="zukan-level">Lv.{mojimon.level}</span>}
    </div>
  );
}
