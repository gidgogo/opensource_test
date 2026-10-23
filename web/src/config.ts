// 서버 주소. 기본값은 "지금 웹을 연 컴퓨터와 같은 컴퓨터"라서
// 같은 와이파이에서 http://내IP:5173 으로 들어온 친구도 그대로 접속된다.
// 다른 곳에 서버를 두면 web/.env 에 VITE_API_URL, VITE_SYNC_URL 을 적는다.
export const API = import.meta.env.VITE_API_URL ?? `http://${location.hostname}:8000`;
export const SYNC = import.meta.env.VITE_SYNC_URL ?? `ws://${location.hostname}:1234`;
