import { useEffect, useState, useCallback } from 'react';
import {
  applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
} from '@xyflow/react';
import { doc, yNodes, yEdges, yFeatures, yMemos, linkMaterial } from './yboard';

// Yjs에 있는 공유 내용 + 내 화면에만 있는 정보(선택 여부, 측정된 크기)를 합친다
function merge<T extends { id: string }>(shared: T[], local: T[]): T[] {
  const byId = new Map(local.map((x) => [x.id, x]));
  return shared.map((s) => ({ ...byId.get(s.id), ...s }));
}

export function removeNode(id: string) {
  doc.transact(() => {
    yNodes.delete(id);
    yFeatures.delete(id);
    yMemos.delete(id);
    for (const [eid, e] of yEdges) if (e.source === id || e.target === id) yEdges.delete(eid);
  });
}

export function addEdge(source: string, target: string) {
  for (const e of yEdges.values()) if (e.source === source && e.target === target) return;
  const id = crypto.randomUUID();
  yEdges.set(id, { id, source, target });
}

export function useBoard() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    const syncNodes = () => setNodes((local) => merge(Array.from(yNodes.values()), local));
    const syncEdges = () => setEdges((local) => merge(Array.from(yEdges.values()), local));
    yNodes.observe(syncNodes);
    yEdges.observe(syncEdges);
    syncNodes();
    syncEdges();
    return () => { yNodes.unobserve(syncNodes); yEdges.unobserve(syncEdges); };
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((n) => applyNodeChanges(changes, n)); // 내 화면에 바로 반영 (선택, 크기 포함)
    doc.transact(() => {
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          const n = yNodes.get(c.id);
          if (n) yNodes.set(c.id, { ...n, position: c.position }); // 움직인 카드만 갱신
        }
        if (c.type === 'remove') removeNode(c.id);
      }
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((e) => applyEdgeChanges(changes, e));
    for (const c of changes) if (c.type === 'remove') yEdges.delete(c.id);
  }, []);

  // 자료 카드를 기능 카드에 선으로 이으면 기능 카드의 '연결된 자료' 칩에도 들어간다
  const onConnect = useCallback((c: Connection) => {
    addEdge(c.source, c.target);
    const [a, b] = [yNodes.get(c.source), yNodes.get(c.target)];
    const feature = [a, b].find((n) => n?.type === 'feature');
    const material = [a, b].find((n) => n?.type === 'material');
    if (feature && material) linkMaterial(feature.id, material.data.materialId as number);
  }, []);

  const addNode = useCallback((node: Node) => yNodes.set(node.id, node), []);

  return { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode };
}
