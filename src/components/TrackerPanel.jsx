export default function TrackerPanel({ trackerProfile, mmrTracker, gameMode }) {
  if (!trackerProfile) {
    return (
      <div className="tracker-panel-placeholder">
        <div className="loading-text">Fetching player stats...</div>
      </div>
    )
  }

  const userInfo = trackerProfile?.userInfo || {}
  const platformInfo = trackerProfile?.platformInfo || {}

  return (
    <div className="tracker-panel">
      <div className="tracker-header">
        <div className="player-info">
          <h3 className="player-name">{platformInfo.platformUserHandle}</h3>
          <p className="player-region">
            {userInfo.countryCode ? `🌍 ${userInfo.countryCode}` : 'Region unknown'}
          </p>
        </div>
      </div>

      {mmrTracker && (
        <div className="mmr-section">
          <div className="mmr-title">{mmrTracker.mode}</div>
          <div className="mmr-display">
            <div className="mmr-box">
              <div className="mmr-label">Starting MMR</div>
              <div className="mmr-value">{mmrTracker.startMMR}</div>
              {mmrTracker.tierIcon && <img src={mmrTracker.tierIcon} alt={mmrTracker.tier} className="tier-icon" />}
              <div className="tier-name">{mmrTracker.tier}</div>
            </div>
            <div className="mmr-arrow">→</div>
            <div className="mmr-box current">
              <div className="mmr-label">Current MMR</div>
              <div className={`mmr-value ${mmrTracker.change > 0 ? 'gain' : mmrTracker.change < 0 ? 'loss' : ''}`}>
                {mmrTracker.currentMMR}
              </div>
              <div className={`mmr-change ${mmrTracker.change > 0 ? 'gain' : mmrTracker.change < 0 ? 'loss' : ''}`}>
                {mmrTracker.change > 0 ? '+' : ''}{mmrTracker.change}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="tracker-stats">
        <h4>Lifetime Stats</h4>
        <div className="stats-grid">
          {[
            { label: 'Wins', key: 'wins' },
            { label: 'Goals', key: 'goals' },
            { label: 'Saves', key: 'saves' },
            { label: 'Assists', key: 'assists' },
            { label: 'MVPs', key: 'mVPs' },
            { label: 'Goal/Shot %', key: 'goalShotRatio' }
          ].map((stat) => {
            const overviewSeg = trackerProfile?.segments?.find((s) => s.type === 'overview')
            const value = overviewSeg?.stats?.[stat.key]?.displayValue || '—'
            return (
              <div key={stat.key} className="stat-item">
                <span className="stat-label">{stat.label}</span>
                <span className="stat-value">{value}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
