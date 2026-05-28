export default function TrackerPanel({ player, trackerProfile, selectedPlaylistId }) {
  const fallbackName = player?.Name || ''
  const teamClass = player?.TeamNum === 0 ? 'team-blue' : player?.TeamNum === 1 ? 'team-orange' : ''

  if (trackerProfile === undefined) {
    return (
      <div className={`tracker-panel mini ${teamClass}`}>
        <div className="player-name">{fallbackName || '…'}</div>
        <div className="loading-text">Loading…</div>
      </div>
    )
  }

  if (trackerProfile === null) {
    return (
      <div className={`tracker-panel mini ${teamClass}`}>
        <div className="player-name">{fallbackName || '?'}</div>
        <div className="loading-text">No tracker data</div>
      </div>
    )
  }

  const platformInfo = trackerProfile?.platformInfo || {}
  const handle = platformInfo.platformUserHandle || fallbackName

  const selectedSegment = trackerProfile?.segments?.find(
    (s) => s.type === 'playlist' && s.attributes?.playlistId === selectedPlaylistId
  )
  const tier = selectedSegment?.stats?.tier?.metadata?.name || 'Unranked'
  const division = selectedSegment?.stats?.division?.metadata?.name || ''
  const mmr = selectedSegment?.stats?.rating?.value
  const tierIcon = selectedSegment?.stats?.tier?.metadata?.iconUrl

  const overviewSeg = trackerProfile?.segments?.find((s) => s.type === 'overview')
  const stat = (key) => overviewSeg?.stats?.[key]?.displayValue || '—'

  return (
    <div className={`tracker-panel mini ${teamClass}`}>
      <div className="tracker-row">
        {tierIcon ? (
          <img src={tierIcon} alt={tier} className="rank-icon" />
        ) : (
          <div className="rank-icon rank-icon-placeholder" />
        )}
        <div className="tracker-meta">
          <div className="player-name">{handle}</div>
          <div className="rank-line">
            <span className="rank-tier">{tier}</span>
            {division && <span className="rank-div">{division}</span>}
            {mmr != null && <span className="rank-mmr">{mmr} MMR</span>}
          </div>
        </div>
      </div>
      <div className="stats-grid">
        {[
          { label: 'Wins', key: 'wins' },
          { label: 'Goals', key: 'goals' },
          { label: 'Saves', key: 'saves' },
          { label: 'Assists', key: 'assists' },
          { label: 'MVPs', key: 'mVPs' },
          { label: 'Shot %', key: 'goalShotRatio' },
        ].map((s) => (
          <div key={s.key} className="stat-item">
            <span className="stat-label">{s.label}</span>
            <span className="stat-value">{stat(s.key)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
