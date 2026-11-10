import { t } from '../i18n'

const PLATFORM_LABEL = { epic: 'Epic', steam: 'Steam', psn: 'PSN', playstation: 'PSN', ps4: 'PSN', ps5: 'PSN', xbox: 'Xbox', xboxone: 'Xbox', xbl: 'Xbox', switch: 'Switch', nintendo: 'Switch' }

const platformOf = (primaryId) => (primaryId?.split('|')[0] || '').toLowerCase()

const trackerUrl = (player) => {
  const platform = { psn: 'psn', ps4: 'psn', ps5: 'psn', playstation: 'psn', xbox: 'xbl', xboxone: 'xbl', xbl: 'xbl' }[platformOf(player.PrimaryId)] || platformOf(player.PrimaryId)
  return `https://rocketleague.tracker.network/rocket-league/profile/${platform}/${encodeURIComponent(player.Name || '')}`
}

const num = (v) => (typeof v === 'number' ? v : 0)

// One card per player: live match stats + tracker.gg rank, merged (they used to
// be two separate panels repeating every player).
// profile: undefined = loading, null = not on tracker.gg, object = loaded.
export default function PlayerCard({ player, profile, playlistId, isMe, onSelectMe, showBoost, limited, isBot }) {
  const team = player.TeamNum === 0 ? 'blue' : 'orange'
  const seg = profile?.segments?.find((s) => s.type === 'playlist' && s.attributes?.playlistId === playlistId)
  const tier = seg?.stats?.tier?.metadata?.name
  const division = seg?.stats?.division?.metadata?.name
  const mmr = seg?.stats?.rating?.value
  const icon = seg?.stats?.tier?.metadata?.iconUrl
  const career = profile?.segments?.find((s) => s.type === 'overview')?.stats
  const boost = Math.max(0, Math.min(100, Math.round(num(player.Boost))))

  let rankText
  if (isBot) rankText = t('card.bot')
  else if (profile === undefined) rankText = t(limited ? 'card.busy' : 'card.loading')
  else if (profile === null) rankText = t('card.noProfile')
  else rankText = tier || t('card.unranked')

  return (
    <article className={`pcard ${team} ${isMe ? 'me' : ''}`}>
      {icon ? <img className="pcard-rank" src={icon} alt={tier} width="52" height="52" /> : <div className="pcard-rank empty" aria-hidden="true" />}
      <div className="pcard-main">
        <div className="pcard-name">
          <span className="pcard-nametext" translate="no" title={player.Name}>{player.Name}</span>
          {/* There is no "me" flag in the Stats API, so the user can say it. */}
          {player.PrimaryId && !isBot && (
            <button type="button" className={`me-btn ${isMe ? 'on' : ''}`} aria-pressed={isMe} onClick={() => onSelectMe(player.PrimaryId)}>
              {isMe ? t('card.you') : t('card.me')}
            </button>
          )}
          <span className="pcard-plat">{PLATFORM_LABEL[platformOf(player.PrimaryId)] || ''}</span>
          {!isBot && (
            <a className="pcard-link" href={trackerUrl(player)} target="_blank" rel="noreferrer" aria-label={t('card.open', { name: player.Name })}>
              {t('card.tracker')}<span aria-hidden="true"> ↗</span>
            </a>
          )}
        </div>
        <div className={`pcard-rankline ${profile === undefined || profile === null || isBot ? 'muted' : ''}`}>
          <span className="pcard-tier">{rankText}</span>
          {division && <span className="pcard-div">{division}</span>}
          {mmr != null && <span className="pcard-mmr">{mmr}</span>}
        </div>
        {showBoost && (
          <div className="boost" role="progressbar" aria-label={t('card.boost')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={boost}>
            <div className="boost-fill" style={{ transform: `scaleX(${boost / 100})` }} />
          </div>
        )}
        {career && (
          <div className="pcard-career">
            <span>{t('card.wins', { n: career.wins?.displayValue || '—' })}</span>
            <span>{t('card.goals', { n: career.goals?.displayValue || '—' })}</span>
            <span>{t('card.shots', { n: career.goalShotRatio?.displayValue || '—' })}</span>
          </div>
        )}
      </div>
      <div className="pcard-stats">
        <div className="pstat score"><b>{num(player.Score)}</b><span>{t('card.score')}</span></div>
        <div className="pstat"><b>{num(player.Goals)}</b><span>{t('stat.goals')}</span></div>
        <div className="pstat"><b>{num(player.Assists)}</b><span>{t('stat.assists')}</span></div>
        <div className="pstat"><b>{num(player.Saves)}</b><span>{t('stat.saves')}</span></div>
        <div className="pstat"><b>{num(player.Shots)}</b><span>{t('card.shotsLabel')}</span></div>
      </div>
    </article>
  )
}
