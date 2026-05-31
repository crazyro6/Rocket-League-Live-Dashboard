import { useState, useEffect, useRef } from 'react'
import './App.css'
import MatchDisplay from './components/MatchDisplay'
import TrackerPanel from './components/TrackerPanel'
import Sparkline from './components/Sparkline'

const PLAYLISTS = [
  { id: 10, label: '1v1' },
  { id: 11, label: '2v2' },
  { id: 13, label: '3v3' },
]

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

// --- Session persistence ---
// The session (history, MMR, started time) survives page refreshes. It is
// auto-reset only when the last activity was a long time ago (a fresh play
// session), or when the user clicks "New session".
const SESSION_KEY = 'rl-session-v1'
const SESSION_MAX_IDLE_MS = 6 * 60 * 60 * 1000 // 6h gap → treat as a new session

// StatfeedEvent names we surface in the live feed (keyed lowercase). Goals are
// handled via the richer GoalScored event; assists/shots/etc. are too noisy.
const STATFEED_FEED = {
  demolish: { icon: '💥', text: (m, s) => `${m.Name} demolished ${s?.Name || '?'}` },
  save: { icon: '🧤', text: (m) => `Save by ${m.Name}` },
  epicsave: { icon: '🔥', text: (m) => `Epic save by ${m.Name}` },
  savior: { icon: '🦸', text: (m) => `${m.Name} saved the day` },
  playmaker: { icon: '🎯', text: (m) => `Playmaker — ${m.Name}` },
  hattrick: { icon: '🎩', text: (m) => `Hat trick — ${m.Name}!` },
  mvp: { icon: '🏆', text: (m) => `MVP — ${m.Name}` },
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data.savedAt !== 'number') return null
    if (Date.now() - data.savedAt > SESSION_MAX_IDLE_MS) return null // stale → start fresh
    return data
  } catch {
    return null
  }
}

function App() {
  // Restore any saved session once on mount (null if none / too old).
  const [bootSession] = useState(loadSession)

  const [matchData, setMatchData] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [error, setError] = useState(null)
  const [debugInfo, setDebugInfo] = useState([])
  const [sessionHistory, setSessionHistory] = useState(() => bootSession?.history || [])
  const [sessionStartedAt, setSessionStartedAt] = useState(() =>
    bootSession?.startedAt ? new Date(bootSession.startedAt) : new Date()
  )
  const [trackerProfiles, setTrackerProfiles] = useState({})
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(11)
  // Per-playlist session MMR tracking for the main (tracked) user.
  // mmrSession: { [playlistId]: { start, current } }
  const [mmrSession, setMmrSession] = useState(() => bootSession?.mmrSession || {})
  const [mmrActivePlaylist, setMmrActivePlaylist] = useState(() => bootSession?.mmrActivePlaylist ?? null)
  // Cumulative gameplay stats for the main user this session.
  const EMPTY_STATS = { goals: 0, assists: 0, saves: 0, shots: 0, score: 0, demos: 0, mvps: 0 }
  const [sessionStats, setSessionStats] = useState(() => ({ ...EMPTY_STATS, ...(bootSession?.sessionStats || {}) }))
  // Per-playlist MMR value series for the sparkline: { [playlistId]: number[] }
  const [mmrSeries, setMmrSeries] = useState(() => bootSession?.mmrSeries || {})
  // Live match event feed (goals, saves, demos…). Ephemeral, not persisted.
  const [eventFeed, setEventFeed] = useState([])
  // Live MMR baseline per playlist, shared with the stream loop so deltas keep
  // computing correctly after a refresh (seeded from the restored session).
  const [initialMmrTrack] = useState(() => {
    const m = new Map()
    const restored = bootSession?.mmrSession || {}
    for (const [pid, v] of Object.entries(restored)) {
      if (v && typeof v.start === 'number' && typeof v.current === 'number') {
        m.set(Number(pid), { start: v.start, current: v.current })
      }
    }
    return m
  })
  const mmrTrackRef = useRef(initialMmrTrack)

  // Identity of "me" (the local user) — drives W/L perspective and the YOU badge.
  // myPrimaryId is the resolved identity (auto-detected or manually set).
  // manualMeRef holds an explicit user override (persisted), read by the stream loop.
  const readSavedMe = () => {
    try {
      return localStorage.getItem('rl-me-primary-id') || ''
    } catch {
      return ''
    }
  }
  const [myPrimaryId, setMyPrimaryId] = useState(() => readSavedMe() || bootSession?.myPrimaryId || '')
  const manualMeRef = useRef(null)
  if (manualMeRef.current === null) manualMeRef.current = readSavedMe()

  const handleSelectMe = (primaryId) => {
    if (!primaryId) return
    manualMeRef.current = primaryId
    setMyPrimaryId(primaryId)
    try {
      localStorage.setItem('rl-me-primary-id', primaryId)
    } catch {
      // ignore persistence failures
    }
  }

  // Persist the session on every change so a refresh restores it.
  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        savedAt: Date.now(),
        startedAt: sessionStartedAt.getTime(),
        history: sessionHistory,
        mmrSession,
        mmrActivePlaylist,
        myPrimaryId,
        sessionStats,
        mmrSeries,
      }))
    } catch {
      // ignore persistence failures
    }
  }, [sessionHistory, sessionStartedAt, mmrSession, mmrActivePlaylist, myPrimaryId, sessionStats, mmrSeries])

  // Start a brand new session (keeps your "me" identity).
  const resetSession = () => {
    mmrTrackRef.current.clear()
    setSessionHistory([])
    setMmrSession({})
    setMmrActivePlaylist(null)
    setSessionStartedAt(new Date())
    setSessionStats({ ...EMPTY_STATS })
    setMmrSeries({})
    setEventFeed([])
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
  }

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

    // --- Main-user MMR session tracking ---
    let mainUserIdentifier = ''
    let mainUserPlatform = ''
    // Seed the playlist from the restored session so a refresh keeps tracking
    // the same one (and post-refresh polls know which MMR to read).
    let activePlaylistId = bootSession?.mmrActivePlaylist ?? null
    let maxPlayerCountThisMatch = 0      // robust playlist detection (immune to leavers)
    const mmrTrack = mmrTrackRef.current // playlistId -> { start, current } (persisted)
    let pollTimer = null
    let pollDeadline = 0                 // keep polling MMR until this timestamp
    let feedSeq = 0                      // monotonic id for live feed entries

    // "Me" detection. The camera target (Game.Target) follows the local player
    // during their own play and only briefly an opponent during a goal replay,
    // so the most-targeted player across the session is almost certainly "me".
    // A manual override (manualMeRef) always wins when present in the match.
    const targetVotes = new Map()        // primaryId -> times seen as camera target

    const teamForPrimaryId = (players, pid) => {
      const p = players.find((pp) => pp?.PrimaryId === pid)
      return p?.TeamNum === 0 || p?.TeamNum === 1 ? p.TeamNum : null
    }

    // Resolve who "me" is among the given players: manual override > most-voted
    // camera target > first player. Returns a PrimaryId (or '').
    const resolveMe = (players) => {
      const manual = manualMeRef.current
      if (manual && players.some((p) => p?.PrimaryId === manual)) return manual

      let best = ''
      let bestVotes = -1
      for (const [pid, votes] of targetVotes) {
        if (votes > bestVotes && players.some((p) => p?.PrimaryId === pid)) {
          best = pid
          bestVotes = votes
        }
      }
      if (best) return best

      return players[0]?.PrimaryId || ''
    }

    const updateTrackedPlayer = (stateData) => {
      const players = Array.isArray(stateData?.Players) ? stateData.Players : []
      if (players.length === 0) return

      // Tally a vote for whoever the camera is following this frame.
      const targetName = stateData?.Game?.bHasTarget ? stateData?.Game?.Target?.Name : ''
      if (targetName) {
        const tp = players.find((p) => p?.Name === targetName)
        if (tp?.PrimaryId) targetVotes.set(tp.PrimaryId, (targetVotes.get(tp.PrimaryId) || 0) + 1)
      }

      const me = resolveMe(players)
      if (!me) return

      if (me !== trackedPlayerPrimaryId) {
        trackedPlayerPrimaryId = me
        setMyPrimaryId(me)
      }

      const mePlayer = players.find((p) => p?.PrimaryId === me) || null
      trackedPlayerName = mePlayer?.Name || trackedPlayerName

      // Capture the main user's tracker.gg lookup keys for MMR polling
      const muPlatform = getPlatformFromPrimaryId(mePlayer?.PrimaryId)
      const muIdentifier = getTrackerIdentifier(mePlayer, muPlatform)
      if (muPlatform && muIdentifier) {
        mainUserPlatform = muPlatform
        mainUserIdentifier = muIdentifier
      }

      const team = teamForPrimaryId(players, me)
      if (team === 0 || team === 1) trackedTeamNum = team
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

    // rocket-league.com URL needs SteamID64 for steam, display name otherwise
    const getTrackerIdentifier = (player, platform) => {
      if (platform === 'steam') {
        const idPart = player?.PrimaryId?.split('|')[1]
        if (idPart) return idPart
      }
      return player?.Name || ''
    }

    // --- MMR session helpers ---

    // Use max player count seen this match so leavers / loading ramps don't
    // misdetect the playlist (a 2v2 momentarily showing 2 players stays 2v2).
    const detectPlaylistId = (count) => {
      if (count === 2) return 10
      if (count === 4) return 11
      if (count === 6) return 13
      return null
    }

    const readMmrFromProfile = (profileData, playlistId) => {
      if (!profileData || playlistId == null) return null
      const seg = profileData.segments?.find(
        (s) => s.type === 'playlist' && s.attributes?.playlistId === playlistId
      )
      const mmr = seg?.stats?.rating?.value
      return typeof mmr === 'number' && mmr > 0 ? mmr : null
    }

    const pushMmrSessionState = (playlistId, track) => {
      if (!isMounted) return
      setMmrSession((prev) => ({ ...prev, [playlistId]: { start: track.start, current: track.current } }))
      setMmrActivePlaylist(playlistId)
    }

    // Assign an MMR change to the oldest still-pending match of that playlist
    // (matches resolve in the order they were played).
    const attributeMmrDelta = (playlistId, delta) => {
      if (!isMounted || delta === 0) return
      setSessionHistory((prev) => {
        let idx = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          const m = prev[i]
          if (m.playlistId === playlistId && m.mmrDelta == null && (m.result === 'W' || m.result === 'L')) {
            idx = i
            break
          }
        }
        if (idx === -1) return prev
        const next = prev.slice()
        next[idx] = { ...next[idx], mmrDelta: delta }
        return next
      })
    }

    // Append a point to the playlist's MMR series for the sparkline (capped).
    const pushMmrSeriesPoint = (playlistId, mmr) => {
      if (!isMounted) return
      setMmrSeries((prev) => {
        const existing = prev[playlistId] || []
        if (existing.length && existing[existing.length - 1] === mmr) return prev
        const next = [...existing, mmr].slice(-60)
        return { ...prev, [playlistId]: next }
      })
    }

    const processMmrReading = (playlistId, mmr) => {
      if (playlistId == null || typeof mmr !== 'number' || mmr <= 0) return
      const track = mmrTrack.get(playlistId)
      if (!track) {
        // First reading this session for this playlist → session start MMR
        const fresh = { start: mmr, current: mmr }
        mmrTrack.set(playlistId, fresh)
        pushMmrSessionState(playlistId, fresh)
        pushMmrSeriesPoint(playlistId, mmr)
        return
      }
      if (mmr === track.current) return
      const delta = mmr - track.current
      track.current = mmr
      attributeMmrDelta(playlistId, delta)
      pushMmrSessionState(playlistId, track)
      pushMmrSeriesPoint(playlistId, mmr)
    }

    const readMainUserMmr = (profileData) => {
      const mmr = readMmrFromProfile(profileData, activePlaylistId)
      if (mmr != null) processMmrReading(activePlaylistId, mmr)
    }

    // Add the main user's final per-match stats to the session totals. MVP is
    // the top scorer on the winning team (RL's own rule), counted if that's me.
    const accumulateSessionStats = (players, me, winnerTeamNum) => {
      if (!isMounted || !Array.isArray(players)) return
      const mePlayer = players.find((p) => p?.PrimaryId === me) || null
      let mvp = 0
      if (winnerTeamNum === 0 || winnerTeamNum === 1) {
        const winners = players.filter((p) => p?.TeamNum === winnerTeamNum)
        const top = winners.reduce((a, b) => ((b?.Score || 0) > (a?.Score || 0) ? b : a), null)
        if (top?.PrimaryId && top.PrimaryId === me) mvp = 1
      }
      setSessionStats((prev) => ({
        goals: prev.goals + (mePlayer?.Goals || 0),
        assists: prev.assists + (mePlayer?.Assists || 0),
        saves: prev.saves + (mePlayer?.Saves || 0),
        shots: prev.shots + (mePlayer?.Shots || 0),
        score: prev.score + (mePlayer?.Score || 0),
        demos: prev.demos + (mePlayer?.Demos || 0),
        mvps: prev.mvps + mvp,
      }))
    }

    // Push a live-feed entry (capped, newest first). `mine` highlights events
    // involving the local user.
    const pushFeedEvent = (item) => {
      if (!isMounted) return
      feedSeq += 1
      const entry = { id: `f${feedSeq}`, ...item }
      setEventFeed((prev) => [entry, ...prev].slice(0, 25))
    }

    // MMR updates ~1 min after a match. We can't read it at match end, so we
    // poll the main user's profile and react when the value actually changes.
    // Polling self-limits via pollDeadline so it stops when the app is idle.
    const runMmrPoll = async () => {
      if (!isMounted) return
      if (Date.now() > pollDeadline) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
        return
      }
      if (!mainUserIdentifier || !mainUserPlatform || activePlaylistId == null) return
      const profile = await fetchTrackerProfile(mainUserIdentifier, mainUserPlatform)
      if (!isMounted || !profile) return
      if (trackedPlayerPrimaryId) {
        setTrackerProfiles((prev) => ({ ...prev, [trackedPlayerPrimaryId]: profile }))
      }
      readMainUserMmr(profile)
    }

    const bumpMmrPolling = (windowMs) => {
      pollDeadline = Math.max(pollDeadline, Date.now() + windowMs)
      if (!pollTimer) pollTimer = setInterval(runMmrPoll, 30000)
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
        const trackerFetchedSet = new Set()   // pid → fetched successfully this match
        const trackerInflight = new Set()     // pid → fetch currently in flight
        const trackerAttempts = new Map()     // pid → attempts so far this match
        const MAX_TRACKER_ATTEMPTS = 3

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // The relay closed the stream — almost always because the game's
            // Stats API socket isn't sending yet (RL not in a match, just
            // launched, or it dropped the socket between matches). A clean end
            // must reconnect too; otherwise the app sits "connected" forever and
            // only a manual refresh revives it.
            addDebugInfo('Stream ended — reconnecting...')
            setConnectionStatus('connecting')
            setTimeout(() => {
              if (isMounted) connectToAPI()
            }, 2000)
            return
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
                trackerFetchedSet.clear()
                trackerInflight.clear()
                trackerAttempts.clear()
                maxPlayerCountThisMatch = 0
                if (isMounted) setEventFeed([])
              }

              if (message.Event === 'RoundStarted') {
                roundStarted = true
                currentMatchKey = message.Data?.MatchGuid || currentMatchKey || latestStateData?.Game?.MatchGuid || `match-${Date.now()}`
                // Keep MMR fresh during the match (and capture start MMR if the
                // match-start fetch missed it).
                bumpMmrPolling(8 * 60 * 1000)
              }

              // Live feed: goals (rich) + selected statfeed events.
              if (message.Event === 'GoalScored' && message.Data?.Scorer?.Name) {
                const scorer = message.Data.Scorer
                const assister = message.Data.Assister
                const speed = message.Data.GoalSpeed
                let text = `${scorer.Name} scored`
                if (assister?.Name) text += ` (assist: ${assister.Name})`
                pushFeedEvent({
                  icon: '⚽',
                  teamNum: scorer.TeamNum,
                  mine: !!trackedPlayerName && scorer.Name === trackedPlayerName,
                  text,
                  detail: typeof speed === 'number' && speed > 0 ? `${Math.round(speed)} km/h` : '',
                })
              }

              if (message.Event === 'StatfeedEvent' && message.Data?.MainTarget?.Name) {
                const cfg = STATFEED_FEED[(message.Data.EventName || '').toLowerCase()]
                if (cfg) {
                  const main = message.Data.MainTarget
                  const second = message.Data.SecondaryTarget
                  pushFeedEvent({
                    icon: cfg.icon,
                    teamNum: main.TeamNum,
                    mine: !!trackedPlayerName && main.Name === trackedPlayerName,
                    text: cfg.text(main, second),
                    detail: '',
                  })
                }
              }

              if (message.Event === 'MatchEnded' && message.Data) {
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

                // Winner = team with the higher final score. Rocket League never
                // ties, so the scoreboard is ground truth; only fall back to the
                // plugin's WinnerTeamNum if our captured scores are somehow equal.
                let winnerTeamNum = null
                if (blueScore !== orangeScore) {
                  winnerTeamNum = blueScore > orangeScore ? 0 : 1
                } else if (message.Data.WinnerTeamNum === 0 || message.Data.WinnerTeamNum === 1) {
                  winnerTeamNum = message.Data.WinnerTeamNum
                }

                // My team = the team of the resolved "me" in this match.
                const me = resolveMe(players)
                let playerTeamNum = teamForPrimaryId(players, me)
                if (playerTeamNum !== 0 && playerTeamNum !== 1) playerTeamNum = trackedTeamNum

                if (winnerTeamNum === 0 || winnerTeamNum === 1) {
                  const signature = `${matchKey}|${winnerTeamNum}|${blueScore}|${orangeScore}`
                  if (signature !== lastMatchSignature) {
                    lastMatchSignature = signature
                    matchOutcomeRecorded = true

                    const result = playerTeamNum === 0 || playerTeamNum === 1
                      ? (winnerTeamNum === playerTeamNum ? 'W' : 'L')
                      : null

                    if (isMounted) {
                      setSessionHistory((prev) => [
                        {
                          id: `${Date.now()}-${winnerTeamNum}-${blueScore}-${orangeScore}`,
                          time: new Date().toLocaleTimeString(),
                          blueScore,
                          orangeScore,
                          result,
                          playlistId: activePlaylistId,
                          mmrDelta: null,
                        },
                        ...prev,
                      ].slice(0, 25))
                    }
                    accumulateSessionStats(players, me, winnerTeamNum)
                    // Watch for the post-match MMR update (~1 min later)
                    bumpMmrPolling(6 * 60 * 1000)

                    addDebugInfo(`Match ended ${blueScore}-${orangeScore} → ${result || '?'} (me team ${playerTeamNum}, winner ${winnerTeamNum})`)
                  }
                }
              }

              if (message.Event === 'MatchDestroyed') {
                const matchKey = message.Data?.MatchGuid || currentMatchKey || latestStateData?.Game?.MatchGuid || 'no-guid'
                const hadStarted = roundStarted || peakKnownBlueScore > 0 || peakKnownOrangeScore > 0

                // Resolve my team from the last snapshot, falling back to the
                // running trackedTeamNum.
                const snapPlayers = Array.isArray(latestStateData?.Players) ? latestStateData.Players : []
                let myTeam = teamForPrimaryId(snapPlayers, resolveMe(snapPlayers))
                if (myTeam !== 0 && myTeam !== 1) myTeam = trackedTeamNum
                const canResolvePlayerTeam = myTeam === 0 || myTeam === 1

                if (!matchOutcomeRecorded && hadStarted && canResolvePlayerTeam && hadOpposingTeams) {
                  const signature = `${matchKey}|destroyed|${peakKnownBlueScore}|${peakKnownOrangeScore}`
                  if (signature !== lastMatchSignature) {
                    lastMatchSignature = signature
                    const result = lastKnownWinnerTeamNum === 0 || lastKnownWinnerTeamNum === 1
                      ? (lastKnownWinnerTeamNum === myTeam ? 'W' : 'L')
                      : 'L'

                    if (isMounted) {
                      setSessionHistory((prev) => [
                        {
                          id: `${Date.now()}-destroyed-${peakKnownBlueScore}-${peakKnownOrangeScore}`,
                          time: new Date().toLocaleTimeString(),
                          blueScore: peakKnownBlueScore,
                          orangeScore: peakKnownOrangeScore,
                          result,
                          playlistId: activePlaylistId,
                          mmrDelta: null,
                        },
                        ...prev,
                      ].slice(0, 25))
                    }
                    accumulateSessionStats(snapPlayers, resolveMe(snapPlayers), lastKnownWinnerTeamNum)
                    // Watch for the post-match MMR update (~1 min later)
                    bumpMmrPolling(6 * 60 * 1000)

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

                  // Detect the playlist being played from the peak player count
                  // (robust against leavers). Used for the main user's MMR tracking.
                  if (statePlayers.length > maxPlayerCountThisMatch) {
                    maxPlayerCountThisMatch = statePlayers.length
                  }
                  const detectedPlaylist = detectPlaylistId(maxPlayerCountThisMatch)
                  if (detectedPlaylist != null) {
                    activePlaylistId = detectedPlaylist
                  }

                  // Fetch tracker.gg profile for every player. Only mark a PID
                  // as "done" after a successful response; otherwise we retry on
                  // the next UpdateState (up to MAX_TRACKER_ATTEMPTS). This avoids
                  // permanently losing a player whose first UpdateState arrived
                  // with incomplete fields or whose tracker.gg lookup briefly 404'd.
                  for (const player of statePlayers) {
                    const pid = player?.PrimaryId
                    if (!pid) continue
                    if (trackerFetchedSet.has(pid)) continue
                    if (trackerInflight.has(pid)) continue
                    if ((trackerAttempts.get(pid) || 0) >= MAX_TRACKER_ATTEMPTS) continue

                    const platform = getPlatformFromPrimaryId(pid)
                    const identifier = getTrackerIdentifier(player, platform)
                    // Skip without consuming an attempt — wait for a later
                    // UpdateState where the fields are populated.
                    if (!platform || !identifier) continue

                    trackerInflight.add(pid)
                    const attemptNum = (trackerAttempts.get(pid) || 0) + 1
                    trackerAttempts.set(pid, attemptNum)

                    fetchTrackerProfile(identifier, platform).then((profileData) => {
                      trackerInflight.delete(pid)
                      if (!isMounted) return
                      if (profileData) {
                        trackerFetchedSet.add(pid)
                        setTrackerProfiles((prev) => ({ ...prev, [pid]: profileData }))
                        // Capture the main user's MMR (session start / live value)
                        if (pid === trackedPlayerPrimaryId) readMainUserMmr(profileData)
                      } else if (attemptNum >= MAX_TRACKER_ATTEMPTS) {
                        // Give up — surface the failure in the UI
                        addDebugInfo(`Tracker failed after ${MAX_TRACKER_ATTEMPTS} attempts: ${identifier} (${platform})`)
                        setTrackerProfiles((prev) => ({ ...prev, [pid]: null }))
                      } else {
                        addDebugInfo(`Tracker miss (attempt ${attemptNum}/${MAX_TRACKER_ATTEMPTS}): ${identifier} (${platform}) — will retry`)
                      }
                    })
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
      if (pollTimer) clearInterval(pollTimer)
    }
    // bootSession is set once on mount and never changes; the stream loop should
    // run a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const wins = sessionHistory.filter((m) => m.result === 'W').length
  const losses = sessionHistory.filter((m) => m.result === 'L').length

  const activeMmr = mmrActivePlaylist != null ? mmrSession[mmrActivePlaylist] : null
  const mmrTotal = activeMmr ? activeMmr.current - activeMmr.start : 0
  const activeMmrLabel = PLAYLISTS.find((p) => p.id === mmrActivePlaylist)?.label || ''
  const fmtDelta = (n) => `${n > 0 ? '+' : ''}${n}`

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

  // Derived session figures
  const totalGames = sessionHistory.length
  const decided = wins + losses
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0
  const shootingPct = sessionStats.shots > 0 ? Math.round((sessionStats.goals / sessionStats.shots) * 100) : 0
  const perGame = (n) => (totalGames > 0 ? (n / totalGames).toFixed(1) : '0.0')

  let bestWinStreak = 0
  let curWinRun = 0
  for (let i = sessionHistory.length - 1; i >= 0; i--) {
    const r = sessionHistory[i].result
    if (r === 'W') {
      curWinRun++
      if (curWinRun > bestWinStreak) bestWinStreak = curWinRun
    } else if (r === 'L') {
      curWinRun = 0
    }
  }

  const activeSeries = mmrActivePlaylist != null ? (mmrSeries[mmrActivePlaylist] || []) : []
  const mmrPeak = activeSeries.length ? Math.max(...activeSeries) : null
  const mmrFloor = activeSeries.length ? Math.min(...activeSeries) : null

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
              {eventFeed.length > 0 && (
                <div className="event-feed">
                  <div className="event-feed-head">Match feed</div>
                  <div className="event-feed-list">
                    {eventFeed.map((e) => (
                      <div
                        key={e.id}
                        className={`feed-item ${e.teamNum === 0 ? 'team-blue' : e.teamNum === 1 ? 'team-orange' : ''} ${e.mine ? 'mine' : ''}`}
                      >
                        <span className="feed-icon">{e.icon}</span>
                        <span className="feed-text">{e.text}</span>
                        {e.detail && <span className="feed-detail">{e.detail}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="tracker-section">
              <div className="trackers-toolbar" role="tablist">
                {PLAYLISTS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedPlaylistId === p.id}
                    className={`rank-tab ${selectedPlaylistId === p.id ? 'active' : ''}`}
                    onClick={() => setSelectedPlaylistId(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="trackers-grid">
                <div className="trackers-col">
                  {(matchData.Players || [])
                    .filter((p) => p?.TeamNum === 0)
                    .map((p) => (
                      <TrackerPanel
                        key={p.PrimaryId || p.Name}
                        player={p}
                        trackerProfile={trackerProfiles[p.PrimaryId]}
                        selectedPlaylistId={selectedPlaylistId}
                        isMe={!!p.PrimaryId && p.PrimaryId === myPrimaryId}
                        onSelectMe={handleSelectMe}
                      />
                    ))}
                </div>
                <div className="trackers-col">
                  {(matchData.Players || [])
                    .filter((p) => p?.TeamNum === 1)
                    .map((p) => (
                      <TrackerPanel
                        key={p.PrimaryId || p.Name}
                        player={p}
                        trackerProfile={trackerProfiles[p.PrimaryId]}
                        selectedPlaylistId={selectedPlaylistId}
                        isMe={!!p.PrimaryId && p.PrimaryId === myPrimaryId}
                        onSelectMe={handleSelectMe}
                      />
                    ))}
                </div>
              </div>
            </div>
          </div>
          <div className="session-card">
            <div className="session-header">
              <h2>Session History</h2>
              <div className="session-header-right">
                <span className="session-started">
                  Started at {sessionStartedAt.toLocaleTimeString()}
                </span>
                {sessionHistory.length > 0 && (
                  <button
                    type="button"
                    className="session-reset"
                    onClick={resetSession}
                    title="Clear history and start a new session"
                  >
                    New session
                  </button>
                )}
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
              {activeMmr && (
                <span className="session-mmr">
                  MMR{activeMmrLabel ? ` ${activeMmrLabel}` : ''}: {activeMmr.start} → {activeMmr.current}{' '}
                  <span className={mmrTotal > 0 ? 'mmr-pos' : mmrTotal < 0 ? 'mmr-neg' : ''}>
                    ({fmtDelta(mmrTotal)})
                  </span>
                </span>
              )}
            </div>

            {totalGames > 0 && (
              <div className="session-stats">
                <div className="sstat"><span className="sstat-label">Win rate</span><span className="sstat-value">{winRate}%</span></div>
                <div className="sstat"><span className="sstat-label">Goals</span><span className="sstat-value">{sessionStats.goals} <em>{perGame(sessionStats.goals)}/g</em></span></div>
                <div className="sstat"><span className="sstat-label">Assists</span><span className="sstat-value">{sessionStats.assists} <em>{perGame(sessionStats.assists)}/g</em></span></div>
                <div className="sstat"><span className="sstat-label">Saves</span><span className="sstat-value">{sessionStats.saves} <em>{perGame(sessionStats.saves)}/g</em></span></div>
                <div className="sstat"><span className="sstat-label">Shooting</span><span className="sstat-value">{shootingPct}%</span></div>
                <div className="sstat"><span className="sstat-label">Demos</span><span className="sstat-value">{sessionStats.demos}</span></div>
                <div className="sstat"><span className="sstat-label">MVPs</span><span className="sstat-value">{sessionStats.mvps}</span></div>
                <div className="sstat"><span className="sstat-label">Best streak</span><span className="sstat-value">{bestWinStreak}W</span></div>
              </div>
            )}

            {activeSeries.length >= 2 && (
              <div className="mmr-graph">
                <div className="mmr-graph-head">
                  <span>MMR{activeMmrLabel ? ` ${activeMmrLabel}` : ''} this session</span>
                  <span className="mmr-graph-range">{mmrFloor} – {mmrPeak}</span>
                </div>
                <Sparkline values={activeSeries} />
              </div>
            )}

            <div className="session-list">
              {sessionHistory.length > 0 ? (
                sessionHistory.map((match) => (
                  <div key={match.id} className="session-item">
                    <span>{match.time}</span>
                    <span>{match.blueScore} - {match.orangeScore}</span>
                    <span>{match.result === 'W' ? 'Win' : match.result === 'L' ? 'Loss' : 'Unknown'}</span>
                    <span className={`mmr-delta ${match.mmrDelta > 0 ? 'mmr-pos' : match.mmrDelta < 0 ? 'mmr-neg' : ''}`}>
                      {match.mmrDelta != null
                        ? fmtDelta(match.mmrDelta)
                        : match.playlistId != null ? '…' : ''}
                    </span>
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
