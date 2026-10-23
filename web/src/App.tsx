import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow, type XYPosition } from '@xyflow/react';
import { FeatureNode } from './nodes/FeatureNode';
import { MaterialNode } from './nodes/MaterialNode';
import { MemoNode } from './nodes/MemoNode';
import { MaterialPanel, DRAG_TYPE } from './MaterialPanel';
import { Cursors } from './Cursors';
import { useBoard } from './useBoard';
import { addFeatureNode, addMaterialNode, addMemoNode, findFreeSpot } from './boardActions';
import { FoldersContext, useFolders } from './folders';
import { api } from './api';
import { boardId, me, provider, setMyName, usePeers, useSyncStatus } from './yboard';

const nodeTypes = { feature: FeatureNode, material: MaterialNode, memo: MemoNode };

function TopBar({ onFeature, onMemo }: { onFeature: () => void; onMemo: () => void }) {
  const peers = usePeers();
  const sync = useSyncStatus();
  const [health, setHealth] = useState('확인 중');
  const [name, setName] = useState(me.name);
  useEffect(() => {
    const check = () => api.health().then(() => setHealth('ok')).catch(() => setHealth('꺼짐'));
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="topbar">
      <b>보드: {boardId}</b>
      <button onClick={onFeature}>+ 기능 카드</button>
      <button onClick={onMemo}>+ 메모</button>
      <span className="sep" />
      <label>내 이름 <input value={name} size={8} onChange={(e) => { setName(e.target.value); setMyName(e.target.value); }} /></label>
      <span className="peers" title="지금 이 보드에 있는 사람">
        {peers.map((p) => <span key={p.clientId} className="peer" style={{ background: p.user.color }}>{p.user.name}</span>)}
      </span>
      <span className={`status ${sync === 'connected' ? 'ok' : 'bad'}`}>실시간 {sync === 'connected' ? '연결됨' : '끊김'}</span>
      <span className={`status ${health === 'ok' ? 'ok' : 'bad'}`} data-testid="health">자료 서버 {health}</span>
    </div>
  );
}

function Board() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useBoard();
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);

  // 화면 가운데에서 가까운 빈 자리
  const center = () => {
    const r = wrap.current!.getBoundingClientRect();
    const c = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return findFreeSpot(rf.getNodes(), { x: c.x - 170, y: c.y - 110 });
  };
  // 새 카드를 놓고, 그 자리가 화면 밖이면 그쪽으로 화면을 옮긴다
  const place = (add: (p: XYPosition) => void) => {
    const p = center();
    add(p);
    const r = wrap.current!.getBoundingClientRect();
    const s = rf.flowToScreenPosition(p);
    if (s.x < r.left || s.y < r.top + 50 || s.x + 200 > r.right || s.y + 150 > r.bottom) {
      rf.setCenter(p.x + 170, p.y + 110, { zoom: rf.getZoom(), duration: 300 });
    }
  };

  const onDrop = (e: DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    e.preventDefault();
    addMaterialNode(JSON.parse(raw).id, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const onPointerMove = (e: PointerEvent) => {
    const now = Date.now();
    if (now - lastSent.current < 40) return; // 너무 자주 보내지 않게
    lastSent.current = now;
    provider.awareness.setLocalStateField('cursor', rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  return (
    <div className="app">
      <div className="board" ref={wrap} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
        onPointerMove={onPointerMove} onPointerLeave={() => provider.awareness.setLocalStateField('cursor', null)}>
        <TopBar
          onFeature={() => place((p) => addFeatureNode('새 기능', p))}
          onMemo={() => place((p) => addMemoNode(p))}
        />
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          deleteKeyCode={['Backspace', 'Delete']} minZoom={0.2} fitView fitViewOptions={{ maxZoom: 1, padding: 0.15 }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
          <Cursors />
        </ReactFlow>
      </div>
      <MaterialPanel
        onPull={(m) => place((p) => addMaterialNode(m.id, p))}
        onFeatureFromFolder={(f) => place((p) => addFeatureNode(f.name, p, f.id))}
      />
    </div>
  );
}

export default function App() {
  const folders = useFolders();
  return (
    <FoldersContext.Provider value={folders}>
      <ReactFlowProvider>
        <Board />
      </ReactFlowProvider>
    </FoldersContext.Provider>
  );
}
