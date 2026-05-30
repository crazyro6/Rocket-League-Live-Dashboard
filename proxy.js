import http from 'http'
import net from 'net'
import fetch from 'node-fetch'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const API_HOST = '127.0.0.1'
const API_PORT = 49123
const PROXY_PORT = 3001

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
  xbl: 'xbl',
  switch: 'switch',
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
  console.log(`[TRACKER] GET ${url}`)
  const { status, body } = await curlJson(url)

  if (status === 404) {
    const err = new Error('Player not found on tracker.gg')
    err.status = 404
    throw err
  }
  if (status < 200 || status >= 300) {
    const err = new Error(`Upstream HTTP ${status}`)
    err.status = status
    throw err
  }

  let json
  try {
    json = JSON.parse(body)
  } catch (e) {
    const err = new Error(`Non-JSON response from tracker.gg: ${body.slice(0, 100)}`)
    err.status = 502
    throw err
  }
  if (json?.errors?.length) {
    const msg = json.errors[0]?.message || 'tracker.gg error'
    const err = new Error(msg)
    err.status = 502
    throw err
  }
  // Unwrap { data: {...} } envelope — the front expects the inner shape
  return json?.data ?? json
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
      
      // Try to write to response
      try {
        const ok = res.write(chunk)
        if (!ok && dataCount === 1) {
          console.log(`  ⚠ Response buffer full on first chunk`)
        }
      } catch (e) {
        console.error(`  ✗ Write error on chunk ${dataCount}:`, e.message)
      }
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
    const parts = req.url.split('/').filter(Boolean) // ['tracker', plat, ident]
    const rawPlatform = (parts[1] || '').toLowerCase()
    const identifier = parts[2] ? decodeURIComponent(parts[2]) : ''
    const platform = TRACKER_PLATFORM_MAP[rawPlatform]

    console.log(`[TRACKER] Incoming: rawPlatform=${rawPlatform} → ${platform}, identifier=${identifier}`)

    if (!platform || !identifier) {
      res.writeHead(400, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      })
      res.end(JSON.stringify({ error: `Invalid platform or identifier (got ${rawPlatform}/${identifier})` }))
      return
    }

    fetchTrackerProfile(platform, identifier)
      .then((data) => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        })
        res.end(JSON.stringify(data))
      })
      .catch((err) => {
        console.error(`[TRACKER] Error: ${err.message}`)
        const status = err.status || 500
        res.writeHead(status, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        })
        res.end(JSON.stringify({ error: err.message }))
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






