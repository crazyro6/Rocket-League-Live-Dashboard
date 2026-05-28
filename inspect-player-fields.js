import net from 'net'
import fs from 'fs'

const API_HOST = '127.0.0.1'
const API_PORT = 49123
const OUTPUT_FILE = 'sample-updatestate.json'

const socket = net.createConnection({ host: API_HOST, port: API_PORT })
let buffer = ''
let captured = false

socket.on('connect', () => {
  console.log(`✓ Connected to ${API_HOST}:${API_PORT}`)
  console.log('Waiting for an UpdateState with players...\n')
})

socket.on('data', (chunk) => {
  if (captured) return
  buffer += chunk.toString('utf8')
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let msg
    try {
      msg = JSON.parse(trimmed)
    } catch {
      continue
    }

    if (msg.Event === 'UpdateState' && msg.Data?.Players?.length > 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(msg, null, 2))
      console.log(`✓ Captured UpdateState with ${msg.Data.Players.length} players`)
      console.log(`✓ Saved full message to ${OUTPUT_FILE}\n`)

      const p = msg.Data.Players[0]
      console.log('=== KEYS in Players[0] ===')
      console.log(Object.keys(p).join(', '))

      console.log('\n=== Players[0] FULL ===')
      console.log(JSON.stringify(p, null, 2))

      console.log('\n=== Game KEYS ===')
      console.log(Object.keys(msg.Data.Game || {}).join(', '))

      console.log('\n=== Top-level Data KEYS ===')
      console.log(Object.keys(msg.Data).join(', '))

      captured = true
      socket.destroy()
      process.exit(0)
    }
  }
})

socket.on('error', (err) => {
  console.error('Socket error:', err.message)
  process.exit(1)
})

setTimeout(() => {
  console.error('\n✗ Timed out after 30s — make sure RL is running and in a match/freeplay')
  process.exit(1)
}, 30000)
