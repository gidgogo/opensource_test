import { useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { api, fileUrl, useMaterial, type Material } from '../api';
import { yNodes } from '../yboard';

// Studio 오브젝트는 속성을 JSON으로 받는다: { "Position": "0, 5, 0", "Anchored": true, ... }
function Props({ json }: { json: string }) {
  let props: Record<string, unknown> = {};
  try { props = JSON.parse(json); } catch { return <pre>{json}</pre>; }
  return (
    <table className="props">
      <tbody>
        {Object.entries(props).map(([k, v]) => (
          <tr key={k}><td>{k}</td><td>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

// 보드 카드에는 자료 ID만 두고, 내용은 서버(원본)에서 가져온다
export function MaterialNode({ id, data, selected }: NodeProps) {
  const m = useMaterial(data.materialId as number);
  const [revs, setRevs] = useState<Material[]>([]);
  useEffect(() => {
    if (m?.path) api.revisions(m.id).then(setRevs).catch(() => {});
  }, [m?.id, m?.path, m?.latest_revision]);

  // 같은 스크립트의 다른 수집본(R1, R2 ...)으로 이 카드를 바꾼다. 모두의 화면에서 같이 바뀐다
  const switchTo = (materialId: number) => {
    const n = yNodes.get(id);
    if (n) yNodes.set(id, { ...n, data: { ...n.data, materialId } });
  };

  if (m === undefined) return <div className="card material">불러오는 중…</div>;
  if (m === null) return <div className="card material">지워진 자료예요 (#{String(data.materialId)})</div>;

  const latest = revs.find((r) => r.revision === m.latest_revision);
  return (
    <div className={`card material ${m.kind} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="card-head">
        <span className="kind">{{ image: '이미지', object: '오브젝트', code: '코드' }[m.kind]}{m.class_name ? ` · ${m.class_name}` : ''}</span>
        <span className="badge">{m.source}</span>
        {m.path && revs.length > 1 && (
          <select className="nodrag" value={m.id} onChange={(e) => switchTo(Number(e.target.value))} title="수집 버전">
            {revs.map((r) => <option key={r.id} value={r.id}>R{r.revision} · {r.created_at.slice(5, 16)}</option>)}
          </select>
        )}
        {m.path && revs.length <= 1 && <span className="badge">R{m.revision}</span>}
      </div>
      <b>{m.title}</b>
      {m.path && <div className="muted path">{m.path}</div>}
      {latest && latest.id !== m.id && (
        <button className="nodrag warn-btn" onClick={() => switchTo(latest.id)}>최신 R{latest.revision} 있음 · 이걸로 바꾸기</button>
      )}
      {m.kind === 'image' && <img src={fileUrl(m.content)} draggable={false} />}
      {m.kind === 'code' && <pre className="code-block nodrag nowheel">{m.content}</pre>}
      {m.kind === 'object' && <div className="nodrag nowheel scroll"><Props json={m.content} /></div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
