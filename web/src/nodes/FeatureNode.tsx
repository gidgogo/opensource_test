import { useEffect, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import {
  yFeatures, yComments, featureParts, me, usePeers, useY, doc, STATUSES,
  type Change, type Comment, type Status,
} from '../yboard';
import { api, fileUrl, materialLabel, useMaterial } from '../api';
import { useFolderList } from '../folders';
import { addMaterialNode, findFreeSpot } from '../boardActions';
import { addEdge } from '../useBoard';

// 기능 카드 내용이 (다른 사람에 의해) 생기거나 바뀌면 다시 그린다
function useFeature(id: string) {
  const [f, setF] = useState(() => yFeatures.get(id));
  useEffect(() => {
    const update = () => setF(yFeatures.get(id));
    yFeatures.observe(update);
    update();
    return () => yFeatures.unobserve(update);
  }, [id]);
  useY(f);
  return f;
}

function useComments(cardId: string) {
  const [list, setList] = useState<Comment[]>([]);
  useEffect(() => {
    const sync = () => setList(yComments.toArray().filter((c) => c.cardId === cardId));
    yComments.observe(sync);
    sync();
    return () => yComments.unobserve(sync);
  }, [cardId]);
  return list;
}

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  const submit = () => { if (text.trim()) { onAdd(text.trim()); setText(''); } };
  return (
    <div className="row nodrag">
      <input value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()} />
      <button onClick={submit}>추가</button>
    </div>
  );
}

function CodeChip({ materialId, onOpen, onRemove }: { materialId: number; onOpen: () => void; onRemove: () => void }) {
  const m = useMaterial(materialId);
  return (
    <span className="chip">
      <button className="chip-main" onClick={onOpen} title="보드에서 열기">
        {m ? materialLabel(m) : m === null ? '(지워진 자료)' : '…'}
        {m && m.latest_revision > m.revision && <span className="badge warn">새 R{m.latest_revision}</span>}
      </button>
      <button className="x" onClick={onRemove} title="연결 끊기">×</button>
    </span>
  );
}

function Checklist({ list }: { list: Y.Array<Y.Map<unknown>> }) {
  const peers = usePeers();
  const online = new Set(peers.map((p) => p.user.id));
  return (
    <>
      {list.toArray().map((item, i) => {
        const agreed = item.get('agreed') as Y.Map<string>;
        const names = Array.from(agreed.values());
        const mine = agreed.has(me.id);
        const everyone = online.size > 0 && [...online].every((u) => agreed.has(u));
        return (
          <div key={item.get('id') as string} className={`check ${everyone ? 'done' : ''}`}>
            <button className={mine ? 'agree on' : 'agree'} onClick={() => (mine ? agreed.delete(me.id) : agreed.set(me.id, me.name))}>
              {mine ? '✔ 동의함' : '동의'}
            </button>
            <span className="grow">{item.get('text') as string}</span>
            <span className="muted" title={names.join(', ')}>{names.length ? names.join(', ') : '아직 없음'}</span>
            <button className="x" onClick={() => list.delete(i)}>×</button>
          </div>
        );
      })}
      <AddLine placeholder="합의할 것 (예: 보스 체력 5000)" onAdd={(text) => {
        const item = new Y.Map<unknown>();
        item.set('id', crypto.randomUUID());
        item.set('text', text);
        item.set('agreed', new Y.Map<string>());
        list.push([item]);
      }} />
    </>
  );
}

function Comments({ cardId }: { cardId: string }) {
  const comments = useComments(cardId);
  const [busy, setBusy] = useState(false);
  const post = (text: string, image?: string) =>
    yComments.push([{ id: crypto.randomUUID(), cardId, authorId: me.id, author: me.name, text, image, at: Date.now() }]);
  const attach = async (file: File) => {
    setBusy(true);
    try {
      const m = await api.upload(file, { attach: true });
      post('', m.content);
    } catch (e) {
      alert('이미지 올리기 실패: ' + e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="comments nowheel">
        {comments.map((c) => (
          <div key={c.id} className="comment">
            <b>{c.author}</b> {c.text}
            {c.image && <a href={fileUrl(c.image)} target="_blank"><img src={fileUrl(c.image)} /></a>}
            <span className="muted"> {new Date(c.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
      </div>
      <div className="row nodrag">
        <AddLine placeholder="댓글" onAdd={(t) => post(t)} />
        <label className="btn" title="이미지 첨부">
          {busy ? '…' : '🖼'}
          <input type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) attach(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>
    </>
  );
}

export function FeatureNode({ id, selected }: NodeProps) {
  const f = useFeature(id);
  const folders = useFolderList();
  const rf = useReactFlow();
  if (!f) return <div className="card feature">불러오는 중…</div>;

  const { changes, checklist, links } = featureParts(f);
  const folder = folders.find((x) => x.id === f.get('folderId'));

  // 칩을 누르면: 보드에 이미 있으면 그 카드로 이동, 없으면 기능 카드 오른쪽에 꺼내고 선으로 잇는다
  const openMaterial = (materialId: number) => {
    const existing = rf.getNodes().find((n) => n.type === 'material' && n.data.materialId === materialId);
    if (existing) {
      rf.setCenter(existing.position.x + 180, existing.position.y + 120, { zoom: rf.getZoom(), duration: 400 });
      return;
    }
    const self = rf.getNode(id)!;
    const nid = addMaterialNode(materialId, findFreeSpot(rf.getNodes(), { x: self.position.x + 400, y: self.position.y }));
    addEdge(id, nid);
  };

  return (
    <div className={`card feature ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="card-head">
        <span className="kind">기능</span>
        <select className="nodrag" value={f.get('status') as Status} onChange={(e) => f.set('status', e.target.value)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        {folder && <span className="badge" title="이 기능의 자료 폴더">📁 {folder.name}</span>}
      </div>
      <input className="title nodrag" value={f.get('title') as string} onChange={(e) => f.set('title', e.target.value)} />

      <section>
        <h4>바뀌는 점</h4>
        {changes.toArray().map((c: Change, i) => (
          <div key={c.id} className="line">
            <span className="grow">• {c.text}</span>
            <span className="muted">{c.author}</span>
            <button className="x nodrag" onClick={() => changes.delete(i)}>×</button>
          </div>
        ))}
        <AddLine placeholder="예: 2페이즈에 돌진 공격 추가" onAdd={(text) =>
          changes.push([{ id: crypto.randomUUID(), text, author: me.name, at: Date.now() }])} />
      </section>

      <section>
        <h4>합의 체크리스트</h4>
        <Checklist list={checklist} />
      </section>

      <section>
        <h4>연결된 코드/오브젝트</h4>
        <div className="chips nodrag">
          {links.toArray().map((mid) => (
            <CodeChip key={mid} materialId={mid} onOpen={() => openMaterial(mid)}
              onRemove={() => doc.transact(() => links.delete(links.toArray().indexOf(mid)))} />
          ))}
          {links.length === 0 && <span className="muted">오른쪽 '받은 자료'에서 연결하거나, 자료 카드를 선으로 이으세요</span>}
        </div>
      </section>

      <section>
        <h4>댓글</h4>
        <Comments cardId={id} />
      </section>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
