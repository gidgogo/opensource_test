import { ViewportPortal } from '@xyflow/react';
import { provider, usePeers } from './yboard';

// 다른 사람들의 마우스 위치를 보드 위에 그린다 (보드 좌표라서 확대/이동해도 맞는 자리에 보인다)
export function Cursors() {
  const peers = usePeers().filter((p) => p.clientId !== provider.awareness.clientID && p.cursor);
  return (
    <ViewportPortal>
      {peers.map((p) => (
        <div key={p.clientId} className="cursor" style={{ transform: `translate(${p.cursor!.x}px, ${p.cursor!.y}px)` }}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M0 0 L0 13 L4 9 L7 15 L9 14 L6 8 L12 8 Z" fill={p.user.color} /></svg>
          <span style={{ background: p.user.color }}>{p.user.name}</span>
        </div>
      ))}
    </ViewportPortal>
  );
}
