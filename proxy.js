import http from 'http'
import net from 'net'
import fetch from 'node-fetch'

const API_HOST = '127.0.0.1'
const API_PORT = 49123
const PROXY_PORT = 3001

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

  if (req.url === '/' || req.url === '/api' || req.url === '/api/') {
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
    // Tracker API relay endpoint: /tracker/platform/username
    // Fetches fresh data per match (no caching) for live MMR updates
    const parts = req.url.split('/')
    const platform = parts[2]?.toLowerCase()
    const username = parts[3]

    console.log(`[TRACKER] Incoming: platform=${platform}, username=${username}`)

    if (!platform || !username) {
      console.log(`[TRACKER] Invalid params`)
      res.writeHead(400, { 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ error: 'Invalid tracker params' }))
      return
    }

    // Fetch fresh from Tracker API
    const trackerUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(username)}`
    console.log(`[TRACKER] Fetching: ${trackerUrl}`)

    fetch(trackerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://tracker.gg/',
        'Origin': 'https://tracker.gg'
      }
    })
      .then((response) => {
        console.log(`[TRACKER] Response status: ${response.status}`)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.json()
      })
      .then((data) => {
        console.log(`[TRACKER] Got data, sending to client`)
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        })
        res.end(JSON.stringify(data))
      })
      .catch((err) => {
        console.error(`[TRACKER] Error: ${err.message}`)
        res.writeHead(500, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        })
        res.end(JSON.stringify({ error: err.message }))
      })
  } else {
    console.log(`  ✗ Unknown path: ${req.url}`)
    res.writeHead(404, {
      'Access-Control-Allow-Origin': req.headers.origin || '*'
    })
    res.end('Not found')
  }

})

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`✓ Proxy listening on port ${PROXY_PORT} (0.0.0.0)`)
})

server.on('error', (err) => {
  console.error('Server error:', err.message)
})






