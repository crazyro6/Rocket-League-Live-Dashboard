import { t } from '../i18n'

const fmtClock = (s) => {
  const t = Math.max(0, Math.floor(typeof s === 'number' ? s : 0))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// "Stadium_P" / "Cosmic_Night_P" -> "Stadium" / "Cosmic Night"
const arenaName = (a) => (a || '').replace(/_P$/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')

export default function Scoreboard({ game, playlistLabel }) {
  const teams = game?.Teams || []
  const blue = teams.find((t) => t.TeamNum === 0)
  const orange = teams.find((t) => t.TeamNum === 1)
  const arena = arenaName(game?.Arena)
  return (
    <section className="scoreboard" aria-label={t('sb.label')}>
      <div className="sb-team blue">
        <span className="sb-name">{blue?.Name || 'Blue'}</span>
        <span className="sb-score">{blue?.Score ?? 0}</span>
      </div>
      <div className="sb-mid">
        <span className="sb-clock">{game?.bOvertime ? t('sb.overtime') : fmtClock(game?.TimeSeconds)}</span>
        <span className="sb-meta">{playlistLabel && arena ? t('sb.on', { playlist: playlistLabel, arena }) : playlistLabel || arena}</span>
      </div>
      <div className="sb-team orange">
        <span className="sb-score">{orange?.Score ?? 0}</span>
        <span className="sb-name">{orange?.Name || 'Orange'}</span>
      </div>
    </section>
  )
}
