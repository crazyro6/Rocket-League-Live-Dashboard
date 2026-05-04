import net from 'net'

const API_HOST = '127.0.0.1'
const API_PORT = 49123

const socket = net.createConnection({ host: API_HOST, port: API_PORT })
let lineCount = 0
let buffer = ''

socket.on('data', (chunk) => {
  buffer += chunk.toString('utf8')
  
  const lines = buffer.split('\n')
  
  // Process all complete lines
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim()
    
    if (!line) continue
    
    lineCount++
    
    if (lineCount <= 10) {
      // Print first 10 lines/messages
      if (line.length > 200) {
        console.log(`Line ${lineCount} (${line.length} bytes):`, line.substring(0, 200) + '...')
      } else {
        console.log(`Line ${lineCount}:`, line)
      }
      
      // Try to parse as JSON
      try {
        const msg = JSON.parse(line)
        console.log(`  → Parsed as JSON. Event: "${msg.Event}"`)
        if (msg.Event === 'UpdateState' && msg.Data) {
          console.log(`    Players count: ${msg.Data.Players?.length || 'N/A'}`)
          console.log(`    Data keys: ${Object.keys(msg.Data).join(', ')}`)
        }
      } catch (e) {
        console.log(`  → Not JSON or invalid`)
      }
    }
    
    if (lineCount === 10) {
      console.log('\n... stopping after 10 messages')
      process.exit(0)
    }
  }
  
  buffer = lines[lines.length - 1]
})

socket.on('error', (err) => {
  console.error('Socket error:', err.message)
  process.exit(1)
})

socket.on('end', () => {
  console.log('\nSocket closed')
  process.exit(0)
})

console.log(`Connecting to ${API_HOST}:${API_PORT}...`)
setTimeout(() => {
  console.error('Timeout waiting for data')
  process.exit(1)
}, 5000)
