import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Node, Edge } from '@xyflow/react';
import { SYNC } from './config';

// 주소의 ?board=이름 으로 보드(방)를 고른다. 없으면 'main'
export const boardId = new URLSearchParams(location.search).get('board') ?? 'main';

export const doc = new Y.Doc();
export const provider = new WebsocketProvider(SYNC, `board-${boardId}`, doc);

// 카드와 연결선: id → 카드 하나. 카드 단위로 넣고 빼기 때문에 서로 다른 카드는 충돌하지 않는다
// 카드에는 위치와 종류, 자료 ID 정도만 두고 내용은 아래 공유 타입이나 자료 서버에 둔다
export const yNodes = doc.getMap<Node>('nodes');
export const yEdges = doc.getMap<Edge>('edges');

// 기능 카드 내용: 카드 id → Y.Map { title, status, folderId, changes, checklist, links }
// 칸마다 따로 저장하니까 한 사람이 체크리스트를, 다른 사람이 변경점을 동시에 고쳐도 둘 다 남는다
export const yFeatures = doc.getMap<Y.Map<unknown>>('features');
// 메모 카드 글: 카드 id → Y.Text (글자 단위로 합쳐진다)
export const yMemos = doc.getMap<Y.Text>('memos');
// 댓글: 배열에 추가만 하므로 두 사람이 동시에 달아도 둘 다 남는다
export type Comment = { id: string; cardId: string; authorId: string; author: string; text: string; image?: string; at: number };
export const yComments = doc.getArray<Comment>('comments');
// 자료 서버(폴더, 자료)가 바뀌었다는 신호. 값이 바뀌면 모든 사람이 목록을 다시 불러온다
export const yMeta = doc.getMap<number>('meta');
export const bumpServerData = () => yMeta.set('serverData', Date.now());

// ---------- 기능 카드 ----------
export type Change = { id: string; text: string; author: string; at: number };
export type Status = '논의중' | '합의됨' | '구현중' | '완료';
export const STATUSES: Status[] = ['논의중', '합의됨', '구현중', '완료'];

export function createFeature(id: string, title: string, folderId: number | null = null) {
  const f = new Y.Map<unknown>();
  f.set('title', title);
  f.set('status', '논의중');
  f.set('folderId', folderId);
  f.set('changes', new Y.Array<Change>());
  f.set('checklist', new Y.Array<Y.Map<unknown>>()); // 항목: Y.Map { id, text, agreed: Y.Map<사용자id, 이름> }
  f.set('links', new Y.Array<number>()); // 연결된 자료 id (코드 칩)
  yFeatures.set(id, f);
}

export const featureParts = (f: Y.Map<unknown>) => ({
  changes: f.get('changes') as Y.Array<Change>,
  checklist: f.get('checklist') as Y.Array<Y.Map<unknown>>,
  links: f.get('links') as Y.Array<number>,
});

export function linkMaterial(featureId: string, materialId: number) {
  const f = yFeatures.get(featureId);
  if (!f) return;
  const { links } = featureParts(f);
  if (!links.toArray().includes(materialId)) links.push([materialId]);
}

// ---------- 나 (이름, 색) ----------
const COLORS = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#c2255c', '#0c8599', '#f08c00'];

function load(key: string, make: () => string) {
  let v = localStorage.getItem(key);
  if (!v) { v = make(); localStorage.setItem(key, v); }
  return v;
}
export const me = {
  id: load('userId', () => crypto.randomUUID()),
  name: load('name', () => `손님${Math.floor(Math.random() * 900 + 100)}`),
  color: load('color', () => COLORS[Math.floor(Math.random() * COLORS.length)]),
};
provider.awareness.setLocalStateField('user', me);

export function setMyName(name: string) {
  me.name = name || '익명';
  localStorage.setItem('name', me.name);
  provider.awareness.setLocalStateField('user', me);
}

export type Peer = { clientId: number; user: typeof me; cursor?: { x: number; y: number } | null };
export function usePeers() {
  const [peers, setPeers] = useState<Peer[]>([]);
  useEffect(() => {
    const update = () => {
      const list: Peer[] = [];
      provider.awareness.getStates().forEach((s, clientId) => {
        if (s.user) list.push({ clientId, user: s.user, cursor: s.cursor });
      });
      setPeers(list);
    };
    provider.awareness.on('change', update);
    update();
    return () => provider.awareness.off('change', update);
  }, []);
  return peers;
}

// Y 타입 안의 무엇이든 바뀌면 다시 그린다
export function useY(t: Y.AbstractType<any> | undefined) {
  const [, setV] = useState(0);
  useEffect(() => {
    if (!t) return;
    const f = () => setV((v) => v + 1);
    t.observeDeep(f);
    return () => t.unobserveDeep(f);
  }, [t]);
}

export function useSyncStatus() {
  const [status, setStatus] = useState<string>(provider.wsconnected ? 'connected' : 'connecting');
  useEffect(() => {
    const f = (e: { status: string }) => setStatus(e.status);
    provider.on('status', f);
    setStatus(provider.wsconnected ? 'connected' : 'connecting'); // 구독 전에 이미 연결됐을 수도 있다
    return () => provider.off('status', f);
  }, []);
  return status;
}
