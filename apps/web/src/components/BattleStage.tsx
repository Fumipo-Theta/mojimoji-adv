import type { BattleState } from '@mojimoji/core';

/**
 * バトル画面。
 *
 * 描画は CSS/SVG に閉じている。演出が物足りなくなったらこのコンポーネントの
 * 中身だけを PixiJS 等に差し替えればよく、ゲームロジックには波及しない。
 */

function HpBar({ current, max, tone }: { current: number; max: number; tone: 'enemy' | 'player' }) {
  const ratio = max === 0 ? 0 : Math.max(0, current / max);
  return (
    <div className="hpbar" role="progressbar" aria-valuenow={current} aria-valuemax={max}>
      <div className={`hpbar-fill hpbar-${tone}`} style={{ width: `${ratio * 100}%` }} />
      <span className="hpbar-label">
        {current} / {max}
      </span>
    </div>
  );
}

/** 敵「モジケシ」。差し替え用アセットが入るまでの暫定ビジュアル */
function EnemySprite({ state }: { state: BattleState }) {
  const hurt = state.phase === 'resolving' && state.lastOutcome?.kind === 'hit';
  return (
    <div className={`enemy ${hurt ? 'enemy-hurt' : ''}`} aria-label={state.enemy.name}>
      <svg viewBox="0 0 120 120" width="160" height="160" role="img">
        <title>{state.enemy.name}</title>
        <circle cx="60" cy="64" r="44" className={`enemy-body element-${state.enemy.element}`} />
        <circle cx="45" cy="55" r="7" fill="#fff" />
        <circle cx="75" cy="55" r="7" fill="#fff" />
        <circle cx="45" cy="57" r="3.5" fill="#222" />
        <circle cx="75" cy="57" r="3.5" fill="#222" />
        <path d="M44 84 Q60 74 76 84" stroke="#222" strokeWidth="4" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function BattleStage({ state }: { state: BattleState }) {
  const outcome = state.lastOutcome;
  const showDamage = state.phase === 'resolving' && outcome?.kind === 'hit';

  return (
    <section className="stage">
      <header className="stage-enemy">
        <div className="enemy-name">
          {state.enemy.name}
          <span className={`element-chip element-${state.enemy.element}`}>{state.enemy.element}</span>
        </div>
        <HpBar current={state.enemyHp} max={state.enemy.maxHp} tone="enemy" />
      </header>

      <div className="stage-arena">
        <EnemySprite state={state} />
        {showDamage && (
          <div className={`damage-pop ${outcome.critical ? 'damage-crit' : ''}`}>
            {outcome.damage}
            {outcome.critical && <span className="crit-tag">クリティカル!</span>}
          </div>
        )}
        {state.phase === 'enemy-turn' && <div className="enemy-attack-flash" />}
      </div>

      <div className="stage-prompt">
        {state.phase === 'won' ? (
          <p className="prompt-text win">かった！ すごい！</p>
        ) : state.phase === 'lost' ? (
          <p className="prompt-text lose">まけちゃった… もういちど ちょうせん！</p>
        ) : (
          <p className="prompt-text">{state.prompt.hintText}</p>
        )}
        {outcome && state.phase !== 'won' && (
          <p className={`outcome outcome-${outcome.kind}`}>{outcome.message}</p>
        )}
        {state.remainingMs !== null && state.phase === 'awaiting-input' && (
          <p className="timer">のこり {Math.ceil(state.remainingMs / 1000)} びょう</p>
        )}
      </div>

      <footer className="stage-player">
        <span className="player-label">きみ</span>
        <HpBar current={state.playerHp} max={state.playerMaxHp} tone="player" />
      </footer>
    </section>
  );
}
