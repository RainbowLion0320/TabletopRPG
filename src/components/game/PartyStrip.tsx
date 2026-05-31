import type { GameState } from '../../types/game';

interface PartyStripProps {
  state: GameState;
}

export function PartyStrip({ state }: PartyStripProps) {
  return (
    <section className="party-strip-react">
      {state.players.map((player, index) => {
        const hpPct = Math.round((player.currentHp / player.hp) * 100);
        const sanPct = Math.round((player.currentSan / player.san) * 100);
        const isActiveActor = state.exploreMode === 'together' && index === state.currentActorIndex;
        const hasActed = state.exploreMode === 'together' && index < state.currentActorIndex;
        const cardClass = `party-card${isActiveActor ? ' active' : ''}${hasActed ? ' acted' : ''}`;
        return (
          <article className={cardClass} key={player.id}>
            <div className="party-avatar">
              {player.portrait ? <img src={player.portrait} alt="" /> : <span>{player.name.slice(0, 1)}</span>}
            </div>
            <div className="party-meta">
              <strong>
                {player.name}
                {isActiveActor ? <em className="actor-badge">轮到</em> : null}
                {hasActed ? <em className="actor-badge done">✓</em> : null}
              </strong>
              <small>{player.job}</small>
              <div className="mini-bar-row">
                <span>HP</span>
                <div><i style={{ width: `${hpPct}%` }} /></div>
                <em>{player.currentHp}/{player.hp}</em>
              </div>
              <div className="mini-bar-row">
                <span>SAN</span>
                <div><i className="san" style={{ width: `${sanPct}%` }} /></div>
                <em>{player.currentSan}/{player.san}</em>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
