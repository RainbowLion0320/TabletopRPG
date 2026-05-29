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
        return (
          <article className="party-card" key={player.id}>
            <div className={`party-avatar avatar-${index}`} />
            <div className="party-meta">
              <strong>{player.name}</strong>
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
