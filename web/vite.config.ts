import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 웹 주소 하나(5173)만 열면 되게, 자료 서버와 동기화 서버를 이 주소 뒤로 숨긴다
//   /api/...  → 자료 서버 (localhost:8000)
//   /sync/... → 동기화 서버 (localhost:1234, 웹소켓)
// 그래서 같은 와이파이든, 터널로 연 공개 주소든 그 주소 하나로 전부 동작한다
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 같은 와이파이의 다른 컴퓨터에서도 http://내IP:5173 으로 접속
    port: 5173,
    // 터널(공개 주소) 서비스의 주소로 들어오는 것을 허용
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'],
    proxy: {
      '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
      '/sync': { target: 'ws://localhost:1234', ws: true, rewrite: (p) => p.replace(/^\/sync/, '') },
    },
  },
})
