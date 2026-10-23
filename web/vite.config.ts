import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // host: true → 같은 와이파이의 다른 컴퓨터에서도 http://내IP:5173 으로 들어올 수 있다
  server: { host: true, port: 5173 },
})
