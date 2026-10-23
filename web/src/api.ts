import { useEffect, useState } from 'react';
import { API } from './config';
import { yMeta, bumpServerData } from './yboard';

export type Folder = { id: number; name: string; parent_id: number | null };
export type Material = {
  id: number; title: string; kind: 'code' | 'object' | 'image'; content: string; source: string;
  path: string | null; class_name: string | null; revision: number; latest_revision: number; folder_id: number | null; created_at: string;
};

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(API + url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// 바꾸는 요청은 끝나면 다른 사람들에게도 "다시 불러와" 신호를 보낸다
async function change<T>(method: string, url: string, body?: unknown) {
  const r = await call<T>(method, url, body);
  bumpServerData();
  return r;
}

export const api = {
  health: () => call<{ status: string }>('GET', '/health'),
  folders: () => call<Folder[]>('GET', '/folders'),
  createFolder: (name: string, parent_id: number | null = null) => change<Folder>('POST', '/folders', { name, parent_id }),
  renameFolder: (id: number, name: string) => change<Folder>('PATCH', `/folders/${id}`, { name }),
  deleteFolder: (id: number) => change('DELETE', `/folders/${id}`),
  materials: (folderId: number) => call<Material[]>('GET', `/materials?folder_id=${folderId}`),
  inbox: () => call<Material[]>('GET', '/materials?inbox=true'),
  material: (id: number) => call<Material>('GET', `/materials/${id}`),
  revisions: (id: number) => call<Material[]>('GET', `/materials/${id}/revisions`),
  createMaterial: (m: { title: string; content: string; folder_id: number }) => change<Material>('POST', '/materials', m),
  moveMaterial: (id: number, folder_id: number | null) => change<Material>('PATCH', `/materials/${id}`, { folder_id }),
  deleteMaterial: (id: number) => change('DELETE', `/materials/${id}`),
  upload: async (file: File, opts: { folderId?: number; attach?: boolean }) => {
    const form = new FormData();
    form.append('file', file);
    const q = opts.attach ? 'attach=true' : `folder_id=${opts.folderId}`;
    const res = await fetch(`${API}/uploads?${q}`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    const m: Material = await res.json();
    if (!opts.attach) bumpServerData();
    return m;
  },
};

// 자료 서버가 바뀌었다는 신호(누가 폴더를 만들거나 자료를 옮김)를 받을 때마다 숫자가 올라간다
export function useServerVersion() {
  const [v, setV] = useState(yMeta.get('serverData') ?? 0);
  useEffect(() => {
    const f = () => setV(yMeta.get('serverData') ?? 0);
    yMeta.observe(f);
    return () => yMeta.unobserve(f);
  }, []);
  return v;
}

export function useMaterial(id: number | undefined) {
  const version = useServerVersion();
  const [m, setM] = useState<Material | null | undefined>(undefined); // undefined = 불러오는 중, null = 없음
  useEffect(() => {
    if (id === undefined) return;
    let alive = true;
    api.material(id).then((x) => alive && setM(x)).catch(() => alive && setM(null));
    return () => { alive = false; };
  }, [id, version]);
  return m;
}

export const fileUrl = (path: string) => API + path;
export const materialLabel = (m: Pick<Material, 'kind' | 'title' | 'path' | 'revision'>) =>
  `${m.kind === 'image' ? '🖼' : m.kind === 'object' ? '🧊' : '</>'} ${m.title}${m.path ? ` R${m.revision}` : ''}`;
