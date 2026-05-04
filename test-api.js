import net from 'net'

const socket = net.createConnection({ host: '127.0.0.1', port: 49123 })
let dataCount = 0

socket.on('connect', () => {
  console.log('Connected!')
})

socket.on('data', (chunk) => {
  dataCount++
  const str = chunk.toString('utf8')
  const truncated = str.length > 200 ? str.substring(0, 200) + '...' : str
  console.log(`[Chunk ${dataCount} - ${chunk.length} bytes]`)
  console.log(truncated)
  console.log('---')
})

socket.on('error', (err) => {
  console.error('Error:', err.message)
})

socket.on('end', () => {
  console.log('Connection closed')
})

setTimeout(() => {
  socket.destroy()
  console.log('Test ended')
}, 3000)
