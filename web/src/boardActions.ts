import type { Node, XYPosition } from '@xyflow/react';
import { yNodes, yMemos, createFeature, doc, uid } from './yboard';
import * as Y from 'yjs';

// 보드에 카드를 놓는 일은 여기 모아둔다 (패널, 기능 카드, 툴바가 같이 쓴다)
export function addMaterialNode(materialId: number, position: XYPosition) {
  const id = uid();
  yNodes.set(id, { id, type: 'material', position, data: { materialId } });
  return id;
}

export function addFeatureNode(title: string, position: XYPosition, folderId: number | null = null) {
  const id = uid();
  doc.transact(() => {
    createFeature(id, title, folderId);
    yNodes.set(id, { id, type: 'feature', position, data: {} });
  });
  return id;
}

export function addMemoNode(position: XYPosition) {
  const id = uid();
  doc.transact(() => {
    yMemos.set(id, new Y.Text());
    yNodes.set(id, { id, type: 'memo', position, data: {} });
  });
  return id;
}

// want 근처에서 다른 카드와 겹치지 않는 자리를 찾는다 (want부터 시작해 둘레를 넓혀가며)
export function findFreeSpot(nodes: Node[], want: XYPosition, size = { w: 380, h: 240 }) {
  const boxes = nodes.map((n) => ({
    x: n.position.x, y: n.position.y, w: n.measured?.width ?? 340, h: n.measured?.height ?? 200,
  }));
  const free = (x: number, y: number) =>
    boxes.every((b) => x + size.w < b.x || x > b.x + b.w + 20 || y + size.h < b.y || y > b.y + b.h + 20);
  for (let ring = 0; ring < 15; ring++) {
    const steps = Math.max(1, ring * 8);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const p = { x: want.x + Math.cos(a) * ring * 120, y: want.y + Math.sin(a) * ring * 120 };
      if (free(p.x, p.y)) return p;
    }
  }
  return want;
}
