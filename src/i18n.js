import { useSyncExternalStore } from 'react'

// Tiny i18n: a dictionary per language, the choice saved in localStorage and
// defaulting to the browser's language. Missing keys fall back to English.
const DICT = {
  en: {
    'lang.label': 'Language',
    'conn.live': 'Live', 'conn.connected': 'Connected', 'conn.connecting': 'Connecting', 'conn.offline': 'Offline',
    'tabs.label': 'Rank playlist', 'tabs.detected': 'Detected from this match',
    'notice.limited': 'tracker.gg is rate-limiting this PC, so ranks may be missing or stale. Retrying automatically (about {mins} min).',
    'error.relay': 'Cannot connect to relay: {msg}',
    'wait.connected': 'Waiting for a match…', 'wait.connecting': 'Connecting to the game…', 'wait.offline': 'Cannot reach the game',
    'wait.help': 'Open Rocket League with the Stats API enabled. The dashboard appears as soon as a match starts.',
    'wait.demo': 'Try demo mode', 'wait.log': 'Connection log',
    'feed.title': 'Match feed',
    'feed.goal': '{name} scored', 'feed.goalAssist': '{name} scored (assist: {other})',
    'feed.demolish': '{name} demolished {other}', 'feed.save': 'Save by {name}', 'feed.epicsave': 'Epic save by {name}',
    'feed.savior': '{name} saved the day', 'feed.playmaker': 'Playmaker: {name}', 'feed.hattrick': 'Hat trick: {name}!', 'feed.mvp': 'MVP: {name}',
    'session.title': 'Session', 'session.since': 'since {time}', 'session.new': 'New',
    'session.newTitle': 'Clear history and start a new session',
    'session.confirm': 'Start a new session? This clears the history and MMR progress.',
    'session.mmr': 'MMR', 'session.from': 'from {n}', 'session.record': 'Record',
    'session.streak': '{n}{type} streak', 'session.graph': 'MMR this session', 'session.empty': 'No completed matches yet.',
    'stat.goals': 'Goals', 'stat.assists': 'Assists', 'stat.saves': 'Saves', 'stat.shooting': 'Shooting',
    'stat.demos': 'Demos', 'stat.mvps': 'MVPs', 'stat.bestStreak': 'Best streak',
    'result.W': 'W', 'result.L': 'L',
    'card.bot': 'Bot', 'card.busy': 'Tracker busy, retrying…', 'card.loading': 'Loading rank…',
    'card.noProfile': 'No tracker profile', 'card.unranked': 'Unranked',
    'card.you': 'You', 'card.me': 'This is me', 'card.tracker': 'Tracker',
    'card.open': 'Open {name} on tracker.network (new tab)', 'card.boost': 'Boost',
    'card.wins': '{n} wins', 'card.goals': '{n} goals', 'card.shots': '{n}% shots',
    'card.score': 'Score', 'card.shotsLabel': 'Shots',
    'sb.label': 'Scoreboard', 'sb.overtime': 'Overtime', 'sb.on': '{playlist} on {arena}',
    'demo.title': 'Demo mode', 'demo.newMatch': 'New match', 'demo.goalBlue': 'Goal blue', 'demo.goalOrange': 'Goal orange',
    'demo.save': 'Save', 'demo.epicSave': 'Epic save', 'demo.demo': 'Demo', 'demo.end': 'End match', 'demo.leave': 'Leave early', 'demo.exit': 'Exit',
  },
  es: {
    'lang.label': 'Idioma',
    'conn.live': 'En vivo', 'conn.connected': 'Conectado', 'conn.connecting': 'Conectando', 'conn.offline': 'Sin conexión',
    'tabs.label': 'Lista de rango', 'tabs.detected': 'Detectada en esta partida',
    'notice.limited': 'tracker.gg está limitando las peticiones de este PC, así que puede que falten rangos o estén desactualizados. Reintentando solo (unos {mins} min).',
    'error.relay': 'No se puede conectar con el relay: {msg}',
    'wait.connected': 'Esperando una partida…', 'wait.connecting': 'Conectando con el juego…', 'wait.offline': 'No se puede llegar al juego',
    'wait.help': 'Abre Rocket League con la Stats API activada. El panel aparece en cuanto empiece una partida.',
    'wait.demo': 'Probar el modo demo', 'wait.log': 'Registro de conexión',
    'feed.title': 'Eventos de la partida',
    'feed.goal': 'Gol de {name}', 'feed.goalAssist': 'Gol de {name} (asistencia: {other})',
    'feed.demolish': '{name} demolió a {other}', 'feed.save': 'Parada de {name}', 'feed.epicsave': 'Parada épica de {name}',
    'feed.savior': '{name} salvó el día', 'feed.playmaker': 'Creador de juego: {name}', 'feed.hattrick': '¡Hat trick de {name}!', 'feed.mvp': 'MVP: {name}',
    'session.title': 'Sesión', 'session.since': 'desde las {time}', 'session.new': 'Nueva',
    'session.newTitle': 'Borrar el historial y empezar una sesión nueva',
    'session.confirm': '¿Empezar una sesión nueva? Se borrará el historial y el progreso de MMR.',
    'session.mmr': 'MMR', 'session.from': 'desde {n}', 'session.record': 'Balance',
    'session.streak': 'racha de {n}{type}', 'session.graph': 'MMR de esta sesión', 'session.empty': 'Aún no hay partidas completadas.',
    'stat.goals': 'Goles', 'stat.assists': 'Asistencias', 'stat.saves': 'Paradas', 'stat.shooting': 'Puntería',
    'stat.demos': 'Demos', 'stat.mvps': 'MVPs', 'stat.bestStreak': 'Mejor racha',
    'result.W': 'V', 'result.L': 'D',
    'card.bot': 'Bot', 'card.busy': 'Tracker saturado, reintentando…', 'card.loading': 'Cargando rango…',
    'card.noProfile': 'Sin perfil en tracker', 'card.unranked': 'Sin rango',
    'card.you': 'Tú', 'card.me': 'Soy yo', 'card.tracker': 'Tracker',
    'card.open': 'Abrir a {name} en tracker.network (pestaña nueva)', 'card.boost': 'Turbo',
    'card.wins': '{n} victorias', 'card.goals': '{n} goles', 'card.shots': '{n}% de tiros',
    'card.score': 'Puntos', 'card.shotsLabel': 'Tiros',
    'sb.label': 'Marcador', 'sb.overtime': 'Prórroga', 'sb.on': '{playlist} en {arena}',
    'demo.title': 'Modo demo', 'demo.newMatch': 'Nueva partida', 'demo.goalBlue': 'Gol azul', 'demo.goalOrange': 'Gol naranja',
    'demo.save': 'Parada', 'demo.epicSave': 'Parada épica', 'demo.demo': 'Demo', 'demo.end': 'Terminar partida', 'demo.leave': 'Abandonar', 'demo.exit': 'Salir',
  },
}

const KEY = 'rl-lang'
const detect = () => {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved in DICT) return saved
  } catch { /* storage blocked */ }
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en'
}

let lang = detect()
const subs = new Set()
document.documentElement.lang = lang

export const getLang = () => lang
export function setLang(next) {
  if (!(next in DICT) || next === lang) return
  lang = next
  document.documentElement.lang = next
  try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
  subs.forEach((f) => f())
}
// Call in a component so it re-renders when the language changes.
export const useLang = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => lang)

export const t = (key, vars) =>
  (DICT[lang][key] ?? DICT.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '')
