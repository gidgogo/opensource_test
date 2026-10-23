import { useEffect, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { Handle, Position } from '@xyflow/react';
import { yMemos, doc } from '../yboard';

// 바뀐 부분만 Y.Text에 반영한다. 통째로 덮어쓰지 않아서 두 사람이 같은 메모를 써도 글이 합쳐진다
function applyDiff(t: Y.Text, next: string) {
  const prev = t.toString();
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let end = 0;
  while (end < prev.length - start && end < next.length - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++;
  doc.transact(() => {
    t.delete(start, prev.length - start - end);
    t.insert(start, next.slice(start, next.length - end));
  });
}

export function MemoNode({ id, selected }: NodeProps) {
  const [t, setT] = useState(() => yMemos.get(id));
  const [text, setText] = useState(() => t?.toString() ?? '');
  useEffect(() => {
    const update = () => setT(yMemos.get(id));
    yMemos.observe(update);
    update();
    return () => yMemos.unobserve(update);
  }, [id]);
  useEffect(() => {
    if (!t) return;
    const f = () => setText(t.toString());
    t.observe(f);
    f();
    return () => t.unobserve(f);
  }, [t]);

  return (
    <div className={`card memo ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="kind">메모</div>
      <textarea className="nodrag nowheel" value={text} placeholder="자유롭게 적기"
        onChange={(e) => { setText(e.target.value); if (t) applyDiff(t, e.target.value); }} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
