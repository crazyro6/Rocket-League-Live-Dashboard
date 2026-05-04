import http from 'http'
import net from 'net'

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






