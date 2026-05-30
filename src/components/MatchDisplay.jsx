const PLATFORM_MAP = {
  epic: 'epic',
  steam: 'steam',
  psn: 'psn',
  playstation: 'psn',
  ps4: 'psn',
  ps5: 'psn',
  xbox: 'xbox',
  xbl: 'xbox',
}

function getNormalizedPlatform(primaryId) {
  const platformRaw = (primaryId?.split('|')[0] || '').toLowerCase()
  return PLATFORM_MAP[platformRaw] || platformRaw
}

function getPlatformFromPrimaryId(primaryId) {
  const platform = getNormalizedPlatform(primaryId)
  return platform ? platform.toUpperCase() : ''
}

function getBoostValue(boostRaw) {
  if (typeof boostRaw !== 'number' || Number.isNaN(boostRaw)) return 0
  return Math.max(0, Math.min(100, Math.round(boostRaw)))
}

function getTrackerUrl(player) {
  const primaryId = player?.PrimaryId
  const name = player?.Name

  if (!primaryId || !name) {
    return `https://rocketleague.tracker.network/rocket-league/search?query=${encodeURIComponent(name || '')}`
  }

  const platform = getNormalizedPlatform(primaryId)

  return `https://rocketleague.tracker.network/rocket-league/profile/${platform}/${encodeURIComponent(name)}`
}

const MatchDisplay = ({ match }) => {
  if (!match) return <div className="match-card">No match data</div>

  const players = match.Players || []
  const game = match.Game || {}
  const teams = game.Teams || []

  const bluePlayers = players.filter(p => p.TeamNum === 0)
  const orangePlayers = players.filter(p => p.TeamNum === 1)

  const blueTeam = teams.find(t => t.TeamNum === 0)
  const orangeTeam = teams.find(t => t.TeamNum === 1)

  const blueScore = blueTeam?.Score ?? 0
  const orangeScore = orangeTeam?.Score ?? 0

  const renderPlayerStats = (player) => {
    const stats = [
      ['Score', player.Score],
      ['Goals', player.Goals],
      ['Assists', player.Assists],
      ['Saves', player.Saves],
      ['Shots', player.Shots],
      ['Touches', player.Touches],
      ['Demos', player.Demos],
    ]

    return stats
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([label, value]) => (
        <span key={label} className="inline-stat">
          <span className="stat-label">{label}</span>
          <span className="stat-value">{value}</span>
        </span>
      ))
  }

  const renderBoostMeter = (player) => {
    // Boost is only sent for the local player's own team (it's a SPECTATOR
    // field), so opponents have no Boost while you're playing. Hide the bar when
    // there's no real value instead of showing a misleading "0".
    if (typeof player?.Boost !== 'number' || Number.isNaN(player.Boost)) return null

    const boost = getBoostValue(player.Boost)

    return (
      <div className="player-boost">
        <div className="player-boost-label">Boost {boost}</div>
        <div className="player-boost-track">
          <div className="player-boost-fill" style={{ width: `${boost}%` }} />
        </div>
      </div>
    )
  }

  const renderTeam = (teamPlayers, teamScore, teamColor) => {
    const teamName = teamColor === 0 ? 'Blue Team' : 'Orange Team'
    const teamClassName = teamColor === 0 ? 'team-blue' : 'team-orange'

    return (
      <div className={`team ${teamClassName}`}>
        <div className="team-title">{teamName} - Score: {teamScore}</div>
        <div className="player-list">
          {teamPlayers.length > 0 ? (
            teamPlayers.map((player, idx) => (
              <div key={player.PrimaryId || `${player.Name}-${idx}`} className="player">
                <div className="player-header">
                  <div className="player-identity">
                    <div className="player-name">{player.Name} <span className="player-platform">{getPlatformFromPrimaryId(player.PrimaryId)}</span></div>
                    {renderBoostMeter(player)}
                  </div>
                  <a
                    href={getTrackerUrl(player)}
                    target="_blank"
                    rel="noreferrer"
                    className="player-link"
                  >
                    TRN
                  </a>
                </div>
                <div className="player-stats-inline">
                  {renderPlayerStats(player)}
                </div>
              </div>
            ))
          ) : (
            <div className="player">No players data</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="match-card">
      <div className="match-header">
        <div className="final-score">
          {blueScore} - {orangeScore}
        </div>
        <div className="match-info">
          <span>Time: {game.TimeSeconds}s</span>
          <span>Arena: {game.Arena || 'Unknown'}</span>
        </div>
      </div>
      <div className="teams-container">
        {renderTeam(bluePlayers, blueScore, 0)}
        {renderTeam(orangePlayers, orangeScore, 1)}
      </div>
    </div>
  )
}

export default MatchDisplay
