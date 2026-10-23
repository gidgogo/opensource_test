import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { api, materialLabel, useServerVersion, type Folder, type Material } from './api';
import { useFolderList } from './folders';
import { yFeatures, linkMaterial, useY } from './yboard';

export const DRAG_TYPE = 'application/x-material';
const startDrag = (e: DragEvent, m: Material) => {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: m.id }));
  e.dataTransfer.effectAllowed = 'copyMove';
};

type Props = {
  onPull: (m: Material) => void;
  onFeatureFromFolder: (f: Folder) => void;
};

function NewCodeForm({ folderId, onDone }: { folderId: number; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const save = async () => {
    if (!title.trim() || !content.trim()) return;
    await api.createMaterial({ title: title.trim(), content, folder_id: folderId });
    onDone();
  };
  return (
    <div className="form">
      <input placeholder="자료 이름 (예: BossAttack)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="코드를 붙여넣으세요" value={content} onChange={(e) => setContent(e.target.value)} rows={5} />
      <div className="row"><button onClick={save}>저장</button><button onClick={onDone}>취소</button></div>
    </div>
  );
}

function FolderMaterials({ folder, onPull }: { folder: Folder; onPull: Props['onPull'] }) {
  const version = useServerVersion();
  const [items, setItems] = useState<Material[]>([]);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => api.materials(folder.id).then(setItems).catch(() => {}), [folder.id]);
  useEffect(() => { load(); }, [load, version]);

  const upload = async (file: File) => {
    try { await api.upload(file, { folderId: folder.id }); } catch (e) { alert('업로드 실패: ' + e); }
  };

  return (
    <div className="folder-body">
      {items.map((m) => (
        <div key={m.id} className="item" draggable onDragStart={(e) => startDrag(e, m)} title="보드로 끌어다 놓을 수 있어요">
          <span className="grow">{materialLabel(m)}</span>
          <button onClick={() => onPull(m)}>보드로</button>
          <button className="x" onClick={() => confirm(`'${m.title}' 자료를 지울까요?`) && api.deleteMaterial(m.id)}>×</button>
        </div>
      ))}
      {items.length === 0 && <div className="muted">비어 있어요</div>}
      {adding ? <NewCodeForm folderId={folder.id} onDone={() => setAdding(false)} /> : (
        <div className="row">
          <button onClick={() => setAdding(true)}>+ 코드</button>
          <label className="btn">+ 이미지
            <input type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
    </div>
  );
}

function FolderTree({ parent, depth, ...props }: Props & { parent: number | null; depth: number }) {
  const folders = useFolderList();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [dropOn, setDropOn] = useState<number | null>(null);
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // 자료를 폴더 위에 끌어다 놓으면 그 폴더로 옮긴다
  const drop = (e: DragEvent, f: Folder) => {
    setDropOn(null);
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (raw) { e.preventDefault(); api.moveMaterial(JSON.parse(raw).id, f.id); }
  };

  return (
    <>
      {folders.filter((f) => f.parent_id === parent).map((f) => (
        <div key={f.id} style={{ marginLeft: depth ? 14 : 0 }}>
          <div className={`folder ${dropOn === f.id ? 'drop' : ''}`}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setDropOn(f.id); } }}
            onDragLeave={() => setDropOn(null)} onDrop={(e) => drop(e, f)}>
            <span className="grow" onClick={() => toggle(f.id)}>{open.has(f.id) ? '▾' : '▸'} 📁 {f.name}</span>
            <button title="하위 폴더" onClick={async () => {
              const name = prompt('하위 폴더 이름?');
              if (name) { await api.createFolder(name, f.id); setOpen((s) => new Set(s).add(f.id)); }
            }}>+</button>
            <button title="이 폴더로 기능 카드 만들기" onClick={() => props.onFeatureFromFolder(f)}>카드</button>
            <button title="이름 바꾸기" onClick={() => { const n = prompt('새 이름', f.name); if (n) api.renameFolder(f.id, n); }}>✎</button>
            <button className="x" title="폴더 지우기 (안의 자료는 위로 올라감)"
              onClick={() => confirm(`'${f.name}' 폴더를 지울까요? 안의 자료는 남아요`) && api.deleteFolder(f.id)}>×</button>
          </div>
          {open.has(f.id) && (
            <>
              <FolderMaterials folder={f} onPull={props.onPull} />
              <FolderTree {...props} parent={f.id} depth={depth + 1} />
            </>
          )}
        </div>
      ))}
    </>
  );
}

function Inbox({ onPull }: { onPull: Props['onPull'] }) {
  const folders = useFolderList();
  const version = useServerVersion();
  const [items, setItems] = useState<Material[]>([]);
  useY(yFeatures);
  const features = Array.from(yFeatures.entries()).map(([id, f]) => ({ id, title: f.get('title') as string, folderId: f.get('folderId') as number | null }));

  const load = useCallback(() => api.inbox().then(setItems).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 3000); // Studio에서 새로 온 자료 확인
    return () => clearInterval(t);
  }, [load, version]);

  // 기능에 연결: 기능 카드에 칩을 달고, 자료는 그 기능의 폴더로 옮긴다 (폴더가 없으면 기능 이름으로 만든다)
  const linkTo = async (m: Material, featureId: string) => {
    const f = yFeatures.get(featureId);
    if (!f) return;
    linkMaterial(featureId, m.id);
    let folderId = f.get('folderId') as number | null;
    if (!folders.some((x) => x.id === folderId)) {
      folderId = (await api.createFolder(f.get('title') as string)).id;
      f.set('folderId', folderId);
    }
    await api.moveMaterial(m.id, folderId);
    load();
  };

  return (
    <>
      <h3>받은 자료 <span className="muted">Studio에서 보낸 것</span></h3>
      {items.length === 0 && <div className="muted">Studio 플러그인에서 '보드로 보내기'를 누르면 여기 와요</div>}
      {items.map((m) => (
        <div key={m.id} className="inbox-item" draggable onDragStart={(e) => startDrag(e, m)}>
          <div><b>{materialLabel(m)}</b> {m.latest_revision > 1 && <span className="badge">{m.latest_revision}번째 수집</span>}</div>
          <div className="muted path">{m.path} · {m.created_at.slice(5, 16)}</div>
          <div className="row">
            <select value="" onChange={(e) => e.target.value && linkTo(m, e.target.value)}>
              <option value="">기능에 연결…</option>
              {features.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
            <select value="" onChange={(e) => e.target.value && api.moveMaterial(m.id, Number(e.target.value)).then(load)}>
              <option value="">폴더로…</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button onClick={() => onPull(m)}>보드로</button>
          </div>
        </div>
      ))}
    </>
  );
}

export function MaterialPanel(props: Props) {
  const folders = useFolderList();
  return (
    <aside className="panel">
      <h3>기능 트리 <button onClick={async () => { const n = prompt('기능 폴더 이름? (예: 보스 전투)'); if (n) await api.createFolder(n); }}>+ 폴더</button></h3>
      <FolderTree {...props} parent={null} depth={0} />
      {folders.length === 0 && <div className="muted">+ 폴더로 기능 폴더를 만들어 보세요</div>}
      <Inbox onPull={props.onPull} />
    </aside>
  );
}
