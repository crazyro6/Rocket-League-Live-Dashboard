/* global process */
import http from 'http'
import net from 'net'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const API_HOST = '127.0.0.1'
const API_PORT = 49123
const PROXY_PORT = Number(process.env.PORT) || 3001

// Serve the production build (npm run build) so the whole app runs from this
// single process on http://localhost:3001 — no Vite dev server needed.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, 'dist')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  const filePath = path.join(DIST_DIR, path.normalize(urlPath))
  // Prevent path traversal outside dist/
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback → index.html (also the "not built yet" message)
      fs.readFile(path.join(DIST_DIR, 'index.html'), (e2, html) => {
        if (e2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('App not built yet. Run: npm run build')
          return
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] })
        res.end(html)
      })
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
}

const TRACKER_BASE = 'https://api.tracker.gg/api/v2/rocket-league/standard/profile'
const TRACKER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const TRACKER_REFERER = 'https://rocketleague.tracker.network/'

// Map our internal platform slug → tracker.gg API platform segment
const TRACKER_PLATFORM_MAP = {
  epic: 'epic',
  steam: 'steam',
  psn: 'psn',
  playstation: 'psn',
  ps4: 'psn',
  ps5: 'psn',
  xbox: 'xbl',
  xboxone: 'xbl',
  xbl: 'xbl',
  switch: 'switch',
  nintendo: 'switch',
}

// Use system curl to defeat Cloudflare's JA3/TLS fingerprinting that blocks
// node-fetch. Requires curl in PATH (Windows 10+, macOS, Linux all ship it).
function curlJson(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '-s',
      '-S',
      '--compressed',
      '-w', '\n__HTTP_STATUS__:%{http_code}',
      '-A', TRACKER_UA,
      '-H', 'Accept: application/json, text/plain, */*',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', `Origin: ${TRACKER_REFERER.replace(/\/$/, '')}`,
      '-H', `Referer: ${TRACKER_REFERER}`,
      url,
    ]
    const proc = spawn('curl', args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (b) => { stdout += b.toString('utf8') })
    proc.stderr.on('data', (b) => { stderr += b.toString('utf8') })
    proc.on('error', (err) => reject(new Error(`curl failed to start: ${err.message}`)))
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`curl exited ${code}: ${stderr.trim() || 'no stderr'}`))
      const m = stdout.match(/\n__HTTP_STATUS__:(\d+)\s*$/)
      const status = m ? parseInt(m[1], 10) : 0
      const body = m ? stdout.slice(0, m.index) : stdout
      resolve({ status, body })
    })
  })
}

async function fetchTrackerProfile(platform, identifier) {
  const url = `${TRACKER_BASE}/${platform}/${encodeURIComponent(identifier)}`
  const { status, body } = await curlJson(url)

  if (status < 200 || status >= 300) {
    const err = new Error(status === 404 ? 'Player not found on tracker.gg' : `Upstream HTTP ${status}`)
    err.status = status
    throw err
  }

  let json
  try {
    json = JSON.parse(body)
  } catch {
    const err = new Error(`Non-JSON response from tracker.gg: ${body.slice(0, 100)}`)
    err.status = 502
    throw err
  }
  if (json?.errors?.length) {
    const err = new Error(json.errors[0]?.message || 'tracker.gg error')
    err.status = 502
    throw err
  }
  // Unwrap { data: {...} } envelope — the front expects the inner shape
  return json?.data ?? json
}

// --- tracker.gg access layer ---
// tracker.gg answers 429 "Warden::Challenge" (captcha) when it sees bursts, so
// every lookup goes through: disk cache -> one-at-a-time queue with spacing ->
// global cooldown (exponential backoff) after a 429/403. While cooling down we
// serve stale cache instead of hammering the API (which only extends the ban).
const CACHE_FILE = path.join(__dirname, 'tracker-cache.json')
const CACHE_TTL = 15 * 60 * 1000   // normal lookups
const FRESH_TTL = 45 * 1000        // ?fresh=1 (post-match MMR polling)
const NOTFOUND_TTL = 10 * 60 * 1000
const SPACING_MS = 1500            // gap between upstream calls
const COOLDOWN_BASE = 60 * 1000
const COOLDOWN_MAX = 10 * 60 * 1000

const cache = new Map()
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')))) cache.set(k, v)
} catch { /* no cache yet */ }

let saveTimer = null
function saveCache() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    fs.writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(cache)), () => {})
  }, 2000)
}

let cooldownUntil = 0
let cooldownStep = 0
let queue = Promise.resolve()
const inflight = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function limitedError() {
  const err = new Error('tracker.gg is rate-limiting this PC')
  err.status = 429
  err.retryAfter = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000))
  return err
}

// -> { data, cache: 'hit' | 'stale' | 'miss' }. Rejects with .status (+ .retryAfter).
function getTracker(platform, identifier, fresh) {
  const key = `${platform}/${identifier.toLowerCase()}`
  const hit = cache.get(key)
  const age = hit ? Date.now() - hit.at : Infinity
  const ttl = hit?.data === null ? NOTFOUND_TTL : fresh ? FRESH_TTL : CACHE_TTL
  if (hit && age < ttl) {
    if (hit.data === null) {
      return Promise.reject(Object.assign(new Error('Player not found on tracker.gg'), { status: 404 }))
    }
    return Promise.resolve({ data: hit.data, cache: 'hit' })
  }
  const stale = () => (hit && hit.data !== null ? { data: hit.data, cache: 'stale' } : null)
  if (Date.now() < cooldownUntil) {
    return stale() ? Promise.resolve(stale()) : Promise.reject(limitedError())
  }
  if (inflight.has(key)) return inflight.get(key)

  const job = queue.then(async () => {
    if (Date.now() < cooldownUntil) {
      const s = stale()
      if (s) return s
      throw limitedError()
    }
    try {
      const data = await fetchTrackerProfile(platform, identifier)
      cooldownStep = 0
      cache.set(key, { at: Date.now(), data })
      saveCache()
      return { data, cache: 'miss' }
    } catch (err) {
      if (err.status === 404) {
        cache.set(key, { at: Date.now(), data: null })
        saveCache()
      } else if (err.status === 429 || err.status === 403) {
        cooldownStep++
        cooldownUntil = Date.now() + Math.min(COOLDOWN_BASE * 2 ** (cooldownStep - 1), COOLDOWN_MAX)
        console.warn(`[TRACKER] rate-limited (${err.status}) — cooling down ${Math.round((cooldownUntil - Date.now()) / 1000)}s`)
        const s = stale()
        if (s) return s
        throw limitedError()
      }
      throw err
    } finally {
      await sleep(SPACING_MS)
    }
  })
  queue = job.catch(() => {})
  inflight.set(key, job)
  job.then(() => inflight.delete(key), () => inflight.delete(key))
  return job
}

const server = http.createServer((req, res) => {
  console.log(`\n[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`)
  console.log('  Origin:', req.headers.origin)
  console.log('  Host:', req.headers.host)

  if (req.method === 'OPTIONS') {
    console.log('  → Responding to OPTIONS preflight')
    res.writeHead(200, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS, POST',
      'Access-Control-Allow-Headers': 'Content-Type, *',
      'Access-Control-Max-Age': '86400'
    })
    res.end()
    return
  }

  const reqPath = (req.url || '/').split('?')[0]

  if (reqPath === '/rl' || reqPath === '/api') {
    console.log('  → Sending 200 with headers and streaming response')
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked'
    })
    console.log('  → Headers sent, connecting to API...')

    const socket = net.createConnection({ host: API_HOST, port: API_PORT })
    let dataCount = 0
    
    socket.on('connect', () => {
      console.log('  ✓ Connected to API')
    })

    socket.on('data', (chunk) => {
      dataCount++
      if (dataCount === 1) {
        console.log(`  ✓ First data chunk: ${chunk.length} bytes`)
        // Log first message to see structure
        const chunkStr = chunk.toString('utf8');
        const firstNewline = chunkStr.indexOf('\n');
        if (firstNewline > 0) {
          const firstMsg = chunkStr.substring(0, firstNewline);
          console.log(`  → First message preview: ${firstMsg.substring(0, 100)}...`);
        }
      }
      if (dataCount % 5 === 0) {
        console.log(`  ✓ Received chunk ${dataCount}: ${chunk.length} bytes`)
      }
      // NOTE: do NOT res.write(chunk) here — socket.pipe(res) below already
      // forwards every chunk. Writing here too sent each message twice, which
      // made every match event (goals, demos, saves…) show up duplicated.
    })

    socket.on('error', (err) => {
      console.error(`  ✗ Socket error: ${err.message}`)
      if (!res.writableEnded) res.end()
    })

    socket.on('end', () => {
      console.log(`  ✓ API closed after ${dataCount} chunks`)
      if (!res.writableEnded) res.end()
    })

    socket.pipe(res)
    
    req.on('close', () => {
      console.log('  ✗ Client disconnected')
      socket.destroy()
    })

    res.on('error', (err) => {
      console.error(`  ✗ Response error: ${err.message}`)
      socket.destroy()
    })

    req.on('error', (err) => {
      console.error(`  ✗ Request error: ${err.message}`)
      socket.destroy()
    })
  } else if (req.url.startsWith('/tracker/')) {
    // /tracker/<platform>/<identifier>
    // Proxies tracker.gg's internal API. For Steam, <identifier> must be the
    // SteamID64; for epic/psn/xbox, the display name works.
    const [pathPart, query = ''] = req.url.split('?')
    const parts = pathPart.split('/').filter(Boolean) // ['tracker', plat, ident]
    const rawPlatform = (parts[1] || '').toLowerCase()
    let identifier = ''
    try { identifier = parts[2] ? decodeURIComponent(parts[2]) : '' } catch { /* malformed % in a name */ }
    const platform = TRACKER_PLATFORM_MAP[rawPlatform]
    const fresh = new URLSearchParams(query).get('fresh') === '1'
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

    if (!platform || !identifier) {
      res.writeHead(400, headers)
      res.end(JSON.stringify({ error: `Invalid platform or identifier (got ${rawPlatform}/${identifier})` }))
      return
    }

    getTracker(platform, identifier, fresh)
      .then(({ data, cache: c }) => {
        res.writeHead(200, { ...headers, 'X-Tracker-Cache': c })
        res.end(JSON.stringify(data))
      })
      .catch((err) => {
        console.error(`[TRACKER] ${platform}/${identifier}: ${err.message}`)
        res.writeHead(err.status || 500, headers)
        res.end(JSON.stringify({ error: err.message, retryAfter: err.retryAfter }))
      })
  } else {
    // Everything else → the built front-end (dist/), with SPA fallback.
    serveStatic(req, res)
  }

})

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`✓ Proxy listening on port ${PROXY_PORT} (0.0.0.0)`)
})

server.on('error', (err) => {
  console.error('Server error:', err.message)
})






