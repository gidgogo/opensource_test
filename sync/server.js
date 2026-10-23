// 보드 실시간 동기화 서버. y-websocket 공식 서버를 그대로 쓰고, 설정만 여기서 정한다
// 저장 위치(data/)는 utils.js를 불러오기 전에 정해야 해서 import를 나중에 한다
import http from 'node:http'
import { fileURLToPath } from 'node:url'

process.env.YPERSISTENCE ??= fileURLToPath(new URL('./data', import.meta.url)) // 카드, 메모, 댓글이 여기 저장돼서 서버를 껐다 켜도 남는다
const host = process.env.HOST ?? '0.0.0.0' // 같은 와이파이의 다른 컴퓨터도 접속 가능
const port = Number(process.env.PORT ?? 1234)

const { WebSocketServer } = await import('ws')
const { setupWSConnection } = await import('@y/websocket-server/utils')

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', setupWSConnection)

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('sync ok')
})
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})
server.listen(port, host, () => {
  console.log(`동기화 서버: ws://${host}:${port}  (저장 위치: ${process.env.YPERSISTENCE})`)
})
