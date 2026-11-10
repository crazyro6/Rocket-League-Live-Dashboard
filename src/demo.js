// Demo mode (?demo): a fake Stats API + fake tracker.gg profiles, entirely
// client-side. It emits the same messages as the game, so the real App logic
// (history, MMR deltas, feed, me-detection) runs untouched. Needs no backend.

export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

const NAMES = ['Nova', 'Kairo', 'Zephyr', 'Mako', 'Vex', 'Orbit', 'Pixel', 'Rune', 'Axiom', 'Blitz']
const ME = 'RocketFan'
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion', 'Grand Champion']
const PLAYLIST_BY_SIZE = { 2: 10, 4: 11, 6: 13 }

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const ratings = { [ME]: { 10: 640, 11: 1015, 13: 880 } } // mutable: the demo user's MMR
const rating = (name, pid) => ratings[name]?.[pid] ?? 300 + ((hash(name + pid) % 1400))

export function demoProfile(name) {
  const seg = (pid) => {
    const r = rating(name, pid)
    return {
      type: 'playlist',
      attributes: { playlistId: pid },
      stats: {
        tier: { metadata: { name: `${TIERS[Math.min(6, Math.floor(r / 230))]} ${['I', 'II', 'III'][Math.floor(r / 77) % 3]}` } },
        division: { metadata: { name: `Division ${['I', 'II', 'III', 'IV'][hash(name) % 4]}` } },
        rating: { value: r },
      },
    }
  }
  const h = hash(name)
  return {
    platformInfo: { platformUserHandle: name },
    segments: [
      seg(10), seg(11), seg(13),
      { type: 'overview', stats: { wins: { displayValue: String(200 + (h % 3000)) }, goals: { displayValue: String(500 + (h % 9000)) }, goalShotRatio: { displayValue: String(20 + (h % 20)) } } },
    ],
  }
}

let ctl = null // set while a stream is open; the panel buttons call into it
export const demo = {
  newMatch: (size) => ctl?.newMatch(size),
  goal: (team) => ctl?.goal(team),
  stat: (name) => ctl?.stat(name),
  end: () => ctl?.end(),
  leave: () => ctl?.leave(),
}

export function createDemoStream(signal) {
  const enc = new TextEncoder()
  let timer = null
  let st = null // current match state, null between matches

  return new ReadableStream({
    start(c) {
      const send = (Event, Data) => c.enqueue(enc.encode(JSON.stringify({ Event, Data }) + '\n'))
      const team = (t) => st.players.filter((p) => p.TeamNum === t)

      const snapshot = () => {
        const boostPhase = Date.now() / 700
        send('UpdateState', {
          MatchGuid: st.guid,
          Players: st.players.map((p) => ({
            ...p,
            // Boost is only sent for your own team (spectator field).
            Boost: p.TeamNum === 0 ? Math.round(50 + 50 * Math.sin(boostPhase + p.Name.length)) : undefined,
          })),
          Game: {
            Teams: [{ Name: 'Blue', TeamNum: 0, Score: st.score[0] }, { Name: 'Orange', TeamNum: 1, Score: st.score[1] }],
            TimeSeconds: st.time,
            bOvertime: false,
            Arena: 'Cosmic_Night_P',
            bHasTarget: true,
            Target: { Name: ME },
            bHasWinner: false,
          },
        })
      }

      const newMatch = (size = 4) => {
        if (st) leave()
        const per = size / 2
        const pool = [...NAMES].sort(() => Math.random() - 0.5)
        const mk = (Name, TeamNum) => ({ Name, PrimaryId: `Epic|${Name}|0`, TeamNum, Score: 0, Goals: 0, Assists: 0, Saves: 0, Shots: 0, Touches: 0, Demos: 0 })
        st = {
          guid: `demo-${Date.now()}`,
          size,
          score: [0, 0],
          time: 300,
          players: [
            mk(ME, 0),
            ...pool.slice(0, per - 1).map((n) => mk(n, 0)),
            ...pool.slice(per - 1, size - 1).map((n) => mk(n, 1)),
          ],
        }
        send('MatchCreated', { MatchGuid: st.guid })
        send('MatchInitialized', { MatchGuid: st.guid })
        send('RoundStarted', { MatchGuid: st.guid })
      }

      const goal = (t) => {
        if (!st) return
        const scorer = team(t)[Math.floor(Math.random() * team(t).length)]
        const mate = team(t).find((p) => p !== scorer && Math.random() < 0.6)
        st.score[t]++
        scorer.Goals++; scorer.Shots++; scorer.Score += 100
        if (mate) { mate.Assists++; mate.Score += 50 }
        send('GoalScored', {
          MatchGuid: st.guid,
          GoalSpeed: 60 + Math.random() * 90,
          Scorer: { Name: scorer.Name, TeamNum: t },
          Assister: mate ? { Name: mate.Name, TeamNum: t } : { Name: '' },
        })
      }

      const stat = (EventName) => {
        if (!st) return
        const p = st.players[Math.floor(Math.random() * st.players.length)]
        let second
        if (EventName === 'Demolish') {
          const foes = st.players.filter((x) => x.TeamNum !== p.TeamNum)
          second = foes[Math.floor(Math.random() * foes.length)]
          p.Demos++; p.Score += 20
        } else {
          p.Saves++; p.Score += 50
        }
        send('StatfeedEvent', {
          EventName,
          MainTarget: { Name: p.Name, TeamNum: p.TeamNum },
          SecondaryTarget: second ? { Name: second.Name, TeamNum: second.TeamNum } : { Name: '' },
        })
      }

      // Ends the match and, like the real game, updates the demo user's MMR
      // only later (the app has to poll for it).
      const end = () => {
        if (!st) return
        if (st.score[0] === st.score[1]) goal(0) // RL never ties
        const winner = st.score[0] > st.score[1] ? 0 : 1
        send('MatchEnded', { MatchGuid: st.guid, WinnerTeamNum: winner })
        const pid = PLAYLIST_BY_SIZE[st.size]
        // Mostly ranked-sized swings; the odd casual game changes nothing.
        const change = Math.random() < 0.15 ? 0 : (winner === 0 ? 1 : -1) * (8 + Math.floor(Math.random() * 6))
        setTimeout(() => { ratings[ME][pid] += change }, 4000)
        send('MatchDestroyed', { MatchGuid: st.guid })
        st = null
      }

      const leave = () => {
        if (!st) return
        send('MatchDestroyed', { MatchGuid: st.guid })
        st = null
      }

      ctl = { newMatch, goal, stat, end, leave }

      let tick = 0
      timer = setInterval(() => {
        if (!st) return
        if (++tick % 4 === 0 && st.time > 0) st.time-- // 250ms ticks -> 1s
        snapshot()
      }, 250)

      newMatch(4)
      signal?.addEventListener('abort', () => {
        clearInterval(timer)
        ctl = null
        c.error(new DOMException('aborted', 'AbortError'))
      })
    },
    cancel() {
      clearInterval(timer)
      ctl = null
    },
  })
}
