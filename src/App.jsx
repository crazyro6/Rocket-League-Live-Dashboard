import { useState, useEffect } from 'react'
import './App.css'
import MatchDisplay from './components/MatchDisplay'
import TrackerPanel from './components/TrackerPanel'

function extractMessages(buffer) {
  const messages = []

  if (buffer.includes('\n')) {
    const lines = buffer.split(/\r?\n/)
    const remaining = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) messages.push(trimmed)
    }
    return { messages, remaining }
  }

  if (buffer.includes('\0')) {
    const parts = buffer.split('\0')
    const remaining = parts.pop()
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed) messages.push(trimmed)
    }
    return { messages, remaining }
  }

  let depth = 0
  let start = -1
  let remaining = buffer
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (buffer[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        messages.push(buffer.slice(start, i + 1))
        remaining = buffer.slice(i + 1)
        start = -1
      }
    }
  }

  return { messages, remaining }
}

function App() {
  const [matchData, setMatchData] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [error, setError] = useState(null)
  const [debugInfo, setDebugInfo] = useState([])
  const [sessionHistory, setSessionHistory] = useState([])
  const [sessionStartedAt] = useState(() => new Date())
  const [trackerProfile, setTrackerProfile] = useState(null)
  const [mmrTracker, setMmrTracker] = useState(null)
  const [gameMode, setGameMode] = useState(null)

  const addDebugInfo = (msg) => {
    console.log(msg)
    setDebugInfo(prev => [...prev.slice(-6), `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  useEffect(() => {
    let isMounted = true
    let abortController = new AbortController()
    let trackedPlayerPrimaryId = ''
    let trackedPlayerName = ''
    let trackedTeamNum = null

    const findTrackedPlayer = (players) => {
      if (!Array.isArray(players) || players.length === 0) return null

      if (trackedPlayerPrimaryId) {
        const byPrimaryId = players.find((p) => p?.PrimaryId === trackedPlayerPrimaryId)
        if (byPrimaryId) return byPrimaryId
      }

      if (trackedPlayerName) {
        const byName = players.find((p) => p?.Name === trackedPlayerName)
        if (byName) return byName
      }

      return null
    }

    const updateTrackedPlayer = (stateData) => {
      const players = Array.isArray(stateData?.Players) ? stateData.Players : []
      if (players.length === 0) return

      let trackedPlayer = findTrackedPlayer(players)

      if (!trackedPlayer) {
        const targetName = stateData?.Game?.bHasTarget ? stateData?.Game?.Target?.Name : ''
        trackedPlayer = targetName
          ? players.find((p) => p?.Name === targetName)
          : null
      }

      if (!trackedPlayer) {
        trackedPlayer = players[0]
      }

      if (!trackedPlayer) return

      trackedPlayerPrimaryId = trackedPlayer?.PrimaryId || trackedPlayerPrimaryId
      trackedPlayerName = trackedPlayer?.Name || trackedPlayerName

      if (trackedPlayer?.TeamNum === 0 || trackedPlayer?.TeamNum === 1) {
        trackedTeamNum = trackedPlayer.TeamNum
      }
    }

    const getWinnerTeamNumFromState = (stateData) => {
      const game = stateData?.Game
      if (!game) return null

      const teams = Array.isArray(game.Teams) ? game.Teams : []
      const blueScore = teams.find((t) => t.TeamNum === 0)?.Score ?? 0
      const orangeScore = teams.find((t) => t.TeamNum === 1)?.Score ?? 0

      if (blueScore !== orangeScore) {
        return blueScore > orangeScore ? 0 : 1
      }

      if (game?.bHasWinner) {
        const winnerName = typeof game.Winner === 'string' ? game.Winner.toLowerCase() : ''
        const winnerTeam = teams.find((t) => typeof t?.Name === 'string' && t.Name.toLowerCase() === winnerName)
        if (winnerTeam?.TeamNum === 0 || winnerTeam?.TeamNum === 1) {
          return winnerTeam.TeamNum
        }
      }

      return null
    }

    const detectGameMode = (stateData) => {
      // Detect game mode based on player count
      const players = Array.isArray(stateData?.Players) ? stateData.Players : []
      const playerCount = players.length

      // Map player count to mode
      // 2 players = 1v1, 4 = 2v2, 6 = 3v3
      if (playerCount === 2) return { name: '1v1 Duel', playlistId: 10 }
      if (playerCount === 4) return { name: '2v2 Doubles', playlistId: 11 }
      if (playerCount === 6) return { name: '3v3 Standard', playlistId: 13 }

      return null
    }

    const fetchTrackerProfile = async (playerName, platform) => {
      try {
        console.log(`Fetching Tracker: ${platform}/${playerName}`)
        const response = await fetch(`/tracker/${platform}/${playerName}`)
        const text = await response.text()

        console.log('Tracker response status:', response.status)
        console.log('Tracker response text:', text.substring(0, 500))

        if (!response.ok) {
          console.warn(`Tracker API error ${response.status}:`, text)
          return null
        }

        let result
        try {
          result = JSON.parse(text)
        } catch (e) {
          console.error('Failed to parse JSON:', e.message, 'Raw:', text.substring(0, 200))
          return null
        }

        if (result.errors) {
          console.warn('Tracker errors:', result.errors)
          return null
        }

        // Response might be { data: {...} } or just {...}
        return result.data || result
      } catch (err) {
        console.error('Tracker fetch error:', err.message)
        return null
      }
    }

    const getPlatformFromPrimaryId = (primaryId) => {
      const platformRaw = (primaryId?.split('|')[0] || '').toLowerCase()
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
      return PLATFORM_MAP[platformRaw] || platformRaw
    }

    const findMMRForGameMode = (trackerData, playlistId) => {
      if (!trackerData?.segments || !Array.isArray(trackerData.segments)) {
        return null
      }

      const playlistSegment = trackerData.segments.find(
        (seg) => seg.type === 'playlist' && seg.attributes?.playlistId === playlistId
      )

      if (!playlistSegment?.stats?.rating) {
        return null
      }

      return {
        current: playlistSegment.stats.rating.value || 0,
        tier: playlistSegment.stats.tier?.displayValue || 'Unranked',
        tierIcon: playlistSegment.stats.tier?.metadata?.iconUrl || null
      }
    }

    const connectToAPI = async () => {
      const apiUrl = '/rl'

      try {
        addDebugInfo(`Connecting to ${apiUrl}`)
        setConnectionStatus('connecting')
        
        const response = await fetch(apiUrl, {
          signal: abortController.signal
        })

        console.log('Response received:', response)
        console.log('Response status:', response.status)
        console.log('Response headers:', Object.fromEntries(response.headers))

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        addDebugInfo(`✓ Connected! Status: ${response.status}, Reading data stream...`)
        setConnectionStatus('connected')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let messageCount = 0
        let updateStateCount = 0
        let latestStateData = null

        let lastEvent = ''
        let lastProgressCount = -1
        let lastMatchSignature = ''
        let currentMatchKey = ''
        let roundStarted = false
        let matchOutcomeRecorded = false
        let peakKnownBlueScore = 0
        let peakKnownOrangeScore = 0
        let hadOpposingTeams = false
        let lastKnownWinnerTeamNum = null
        let trackerFetchedForMatch = false
        let currentGameMode = null
        let matchStartMMR = null
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            addDebugInfo('Stream ended')
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const extracted = extractMessages(buffer)
          buffer = extracted.remaining

          for (const rawMessage of extracted.messages) {
            const line = rawMessage.trim()
            if (!line) continue

            messageCount++
            try {
              const message = JSON.parse(line)

              if (typeof message.Data === 'string') {
                try {
                  message.Data = JSON.parse(message.Data)
                } catch {
                  // leave Data as-is when not JSON
                }
              }
              
              if (message.Event) {
                if (message.Event !== lastEvent) {
                  addDebugInfo(`Event: ${message.Event}`)
                  lastEvent = message.Event
                }
              }

              if (message.Event === 'MatchCreated' || message.Event === 'MatchInitialized') {
                currentMatchKey = message.Data?.MatchGuid || currentMatchKey || `match-${Date.now()}`
                roundStarted = false
                matchOutcomeRecorded = false
                peakKnownBlueScore = 0
                peakKnownOrangeScore = 0
                hadOpposingTeams = false
                lastKnownWinnerTeamNum = null
                trackerFetchedForMatch = false
                currentGameMode = null
                matchStartMMR = null
              }

              if (message.Event === 'RoundStarted') {
                roundStarted = true
                currentMatchKey = message.Data?.MatchGuid || currentMatchKey || latestStateData?.Game?.MatchGuid || `match-${Date.now()}`
              }

              if (message.Event === 'MatchEnded' && message.Data) {
                const winnerTeamNum = message.Data.WinnerTeamNum
                const eventTeams = Array.isArray(message.Data.Teams) ? message.Data.Teams : null
                const snapshotTeams = Array.isArray(latestStateData?.Game?.Teams) ? latestStateData.Game.Teams : null
                const teams = eventTeams || snapshotTeams || []
                const eventPlayers = Array.isArray(message.Data.Players) ? message.Data.Players : null
                const snapshotPlayers = Array.isArray(latestStateData?.Players) ? latestStateData.Players : null
                const players = eventPlayers || snapshotPlayers || []

                const eventBlueScore = teams.find((t) => t.TeamNum === 0)?.Score ?? 0
                const eventOrangeScore = teams.find((t) => t.TeamNum === 1)?.Score ?? 0
                const blueScore = Math.max(eventBlueScore, peakKnownBlueScore)
                const orangeScore = Math.max(eventOrangeScore, peakKnownOrangeScore)
                const matchKey = message.Data.MatchGuid || currentMatchKey || latestStateData?.Game?.MatchGuid || 'no-guid'

                let playerTeamNum = trackedTeamNum
                if (playerTeamNum !== 0 && playerTeamNum !== 1) {
                  const trackedPlayer = findTrackedPlayer(players)
                  if (trackedPlayer?.TeamNum === 0 || trackedPlayer?.TeamNum === 1) {
                    playerTeamNum = trackedPlayer.TeamNum
                  }
                }

                if (winnerTeamNum === 0 || winnerTeamNum === 1) {
                  const signature = `${matchKey}|${winnerTeamNum}|${blueScore}|${orangeScore}`
                  if (signature !== lastMatchSignature) {
                    lastMatchSignature = signature
                    matchOutcomeRecorded = true

                    if (isMounted) {
                      setSessionHistory((prev) => [
                        {
                          id: `${Date.now()}-${winnerTeamNum}-${blueScore}-${orangeScore}`,
                          time: new Date().toLocaleTimeString(),
                          blueScore,
                          orangeScore,
                          result: playerTeamNum === 0 || playerTeamNum === 1
                            ? (winnerTeamNum === playerTeamNum ? 'W' : 'L')
                            : null,
                        },
                        ...prev,
                      ].slice(0, 25))
                    }

                    addDebugInfo(`Match ended: ${blueScore}-${orangeScore}`)
                  }
                }
              }

              if (message.Event === 'MatchDestroyed') {
                const matchKey = message.Data?.MatchGuid || currentMatchKey || latestStateData?.Game?.MatchGuid || 'no-guid'
                const hadStarted = roundStarted || peakKnownBlueScore > 0 || peakKnownOrangeScore > 0
                const canResolvePlayerTeam = trackedTeamNum === 0 || trackedTeamNum === 1

                if (!matchOutcomeRecorded && hadStarted && canResolvePlayerTeam && hadOpposingTeams) {
                  const signature = `${matchKey}|destroyed|${peakKnownBlueScore}|${peakKnownOrangeScore}`
                  if (signature !== lastMatchSignature) {
                    lastMatchSignature = signature
                    const result = lastKnownWinnerTeamNum === 0 || lastKnownWinnerTeamNum === 1
                      ? (lastKnownWinnerTeamNum === trackedTeamNum ? 'W' : 'L')
                      : 'L'

                    if (isMounted) {
                      setSessionHistory((prev) => [
                        {
                          id: `${Date.now()}-destroyed-${peakKnownBlueScore}-${peakKnownOrangeScore}`,
                          time: new Date().toLocaleTimeString(),
                          blueScore: peakKnownBlueScore,
                          orangeScore: peakKnownOrangeScore,
                          result,
                        },
                        ...prev,
                      ].slice(0, 25))
                    }

                    addDebugInfo(`Match destroyed early: counted as ${result === 'W' ? 'win' : 'loss'} (${peakKnownBlueScore}-${peakKnownOrangeScore})`)
                  }
                }

                currentMatchKey = ''
                roundStarted = false
                matchOutcomeRecorded = false
                peakKnownBlueScore = 0
                peakKnownOrangeScore = 0
                hadOpposingTeams = false
                lastKnownWinnerTeamNum = null
              }
               
              if (message.Event === 'UpdateState' && message.Data) {
                updateStateCount++
                if (isMounted) {
                  latestStateData = message.Data
                  updateTrackedPlayer(message.Data)
                  const statePlayers = Array.isArray(message.Data?.Players) ? message.Data.Players : []
                  const stateTeams = Array.isArray(message.Data?.Game?.Teams) ? message.Data.Game.Teams : []
                  const teamsPresent = new Set(
                    statePlayers
                      .map((p) => p?.TeamNum)
                      .filter((teamNum) => teamNum === 0 || teamNum === 1)
                  )
                  if (teamsPresent.has(0) && teamsPresent.has(1)) {
                    hadOpposingTeams = true
                  }
                  const liveBlueScore = stateTeams.find((t) => t.TeamNum === 0)?.Score ?? 0
                  const liveOrangeScore = stateTeams.find((t) => t.TeamNum === 1)?.Score ?? 0
                  peakKnownBlueScore = Math.max(peakKnownBlueScore, liveBlueScore)
                  peakKnownOrangeScore = Math.max(peakKnownOrangeScore, liveOrangeScore)
                  const detectedWinnerTeamNum = getWinnerTeamNumFromState(message.Data)
                  if (detectedWinnerTeamNum === 0 || detectedWinnerTeamNum === 1) {
                    lastKnownWinnerTeamNum = detectedWinnerTeamNum
                  }
                  currentMatchKey = message.Data?.Game?.MatchGuid || currentMatchKey

                  // Fetch tracker profile once per match (on first UpdateState with valid player)
                  if (!trackerFetchedForMatch && trackedPlayerName) {
                    trackerFetchedForMatch = true
                    const trackedPlayer = findTrackedPlayer(statePlayers)
                    addDebugInfo(`Tracker fetch triggered. Player: ${trackedPlayer?.Name || 'unknown'}`)
                    if (trackedPlayer?.PrimaryId && trackedPlayer?.Name) {
                      const platform = getPlatformFromPrimaryId(trackedPlayer.PrimaryId)
                      addDebugInfo(`Fetching Tracker for ${trackedPlayer.Name} (${platform})`)
                      fetchTrackerProfile(trackedPlayer.Name, platform).then((profileData) => {
                        addDebugInfo(`Tracker fetch complete. Got data: ${profileData ? 'yes' : 'no'}`)
                        if (isMounted && profileData) {
                          setTrackerProfile(profileData)
                          
                          // Detect game mode and get starting MMR
                          const detectedMode = detectGameMode(message.Data)
                          if (detectedMode) {
                            setGameMode(detectedMode)
                            const mmr = findMMRForGameMode(profileData, detectedMode.playlistId)
                            if (mmr) {
                              matchStartMMR = mmr
                              setMmrTracker({
                                mode: detectedMode.name,
                                startMMR: mmr.current,
                                currentMMR: mmr.current,
                                change: 0,
                                tier: mmr.tier,
                                tierIcon: mmr.tierIcon
                              })
                              addDebugInfo(`Loaded ${detectedMode.name}: ${mmr.current} MMR`)
                            } else {
                              addDebugInfo(`No MMR found for ${detectedMode.name} (might be freeplay/unranked)`)
                            }
                          } else {
                            addDebugInfo(`Could not detect game mode (${statePlayers.length} players)`)
                          }
                        } else {
                          addDebugInfo(`Profile data was null or not mounted`)
                        }
                      })
                    } else {
                      addDebugInfo(`No PrimaryId/name data: ${trackedPlayer?.PrimaryId}/${trackedPlayer?.Name}`)
                    }
                  }

                  // Update MMR tracker with current live MMR if we have tracker data
                  if (matchStartMMR && trackerProfile && isMounted) {
                    const currentMode = detectGameMode(message.Data)
                    if (currentMode) {
                      const currentMMR = findMMRForGameMode(trackerProfile, currentMode.playlistId)
                      if (currentMMR) {
                        setMmrTracker((prev) => ({
                          ...prev,
                          currentMMR: currentMMR.current,
                          change: currentMMR.current - matchStartMMR.current
                        }))
                      }
                    }
                  }

                  const playerCount = message.Data.Players?.length || 0
                  if (updateStateCount % 20 === 0) {
                    addDebugInfo(`✓ UpdateState #${updateStateCount}: ${playerCount} players`)
                  }
                  setMatchData(message.Data)
                  setError(null)
                }
              }
            } catch (e) {
              // Log parse errors for debugging
              const preview = line.substring(0, 50)
              console.warn('Parse error on line:', preview, e.message)
            }
          }
          
          if (messageCount > 0 && messageCount % 50 === 0 && messageCount !== lastProgressCount) {
            addDebugInfo(`...${messageCount} messages received...`)
            lastProgressCount = messageCount
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          addDebugInfo('Connection closed')
          return
        }
        addDebugInfo(`✗ Error: ${err.message}`)
        setConnectionStatus('error')
        setError(`Cannot connect to relay: ${err.message}`)
        
        // Reconnect after 3 seconds
        setTimeout(() => {
          if (isMounted) {
            connectToAPI()
          }
        }, 3000)
      }
    }

    connectToAPI()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [])

  const wins = sessionHistory.filter((m) => m.result === 'W').length
  const losses = sessionHistory.filter((m) => m.result === 'L').length

  let streakType = null
  let streakCount = 0
  for (const match of sessionHistory) {
    if (match.result !== 'W' && match.result !== 'L') break
    if (!streakType) {
      streakType = match.result
      streakCount = 1
      continue
    }
    if (match.result === streakType) {
      streakCount++
      continue
    }
    break
  }

  return (
    <div className="app-container">
      <h1>Rocket League Stats</h1>
      
      {error && <div className="error">{error}</div>}
      
      {matchData ? (
        <>
          <div className="main-content">
            <div className="match-section">
              <MatchDisplay match={matchData} />
              <div className="status-indicator connected">
                <span>●</span> Live
              </div>
            </div>
            <div className="tracker-section">
              <TrackerPanel 
                trackerProfile={trackerProfile} 
                mmrTracker={mmrTracker}
                gameMode={gameMode}
              />
            </div>
          </div>
          <div className="session-card">
            <div className="session-header">
              <h2>Session History</h2>
              <div className="session-started">
                Started at {sessionStartedAt.toLocaleTimeString()}
              </div>
            </div>
            <div className="session-summary">
              <span>Wins: {wins}</span>
              <span>Losses: {losses}</span>
              <span>Matches: {sessionHistory.length}</span>
              {streakCount > 0 && (
                <span className={streakType === 'W' ? 'streak-win' : 'streak-loss'}>
                  Streak: {streakCount} {streakType === 'W' ? '🔥' : '🧊'}
                </span>
              )}
            </div>
            <div className="session-list">
              {sessionHistory.length > 0 ? (
                sessionHistory.map((match) => (
                  <div key={match.id} className="session-item">
                    <span>{match.time}</span>
                    <span>{match.blueScore} - {match.orangeScore}</span>
                    <span>{match.result === 'W' ? 'Win' : match.result === 'L' ? 'Loss' : 'Unknown'}</span>
                  </div>
                ))
              ) : (
                <div className="session-empty">No completed matches yet in this session.</div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="waiting-state">
          <div className={`status-indicator ${connectionStatus}`}>
            <span>●</span> {connectionStatus === 'connecting' ? 'Connecting...' : connectionStatus === 'connected' ? 'Connected, waiting for match...' : 'Connection failed'}
          </div>
          <div className="debug-info">
            {debugInfo.map((info, idx) => (
              <div key={idx} className="debug-line">{info}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
