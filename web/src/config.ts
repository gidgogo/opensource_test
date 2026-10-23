// 서버 주소. 기본값은 "지금 웹을 연 그 주소"의 /api, /sync (vite.config.ts 의 proxy 가 실제 서버로 넘겨준다)
// 그래서 localhost든, 같은 와이파이 IP든, 터널로 연 https 공개 주소든 따로 설정할 게 없다.
// 서버를 다른 곳에 따로 두면 web/.env 에 VITE_API_URL, VITE_SYNC_URL 을 적는다.
const wsScheme = location.protocol === 'https:' ? 'wss' : 'ws';
export const API = import.meta.env.VITE_API_URL ?? `${location.origin}/api`;
export const SYNC = import.meta.env.VITE_SYNC_URL ?? `${wsScheme}://${location.host}/sync`;
