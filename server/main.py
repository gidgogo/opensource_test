import os
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from db import HERE, connect, init_db

init_db()
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", HERE / "uploads"))
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="협업 보드 자료 서버")
app.add_middleware(
    CORSMiddleware,
    # 개발 중에는 어느 주소에서 열어도 되게. 배포할 때는 CORS_ORIGINS=https://내사이트 로 좁힌다
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- 기능 폴더 (오른쪽 트리) ----------
class FolderIn(BaseModel):
    name: str
    parent_id: Optional[int] = None


class FolderPatch(BaseModel):
    name: Optional[str] = None


@app.get("/folders")
def list_folders():
    with connect() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM folders ORDER BY id")]


@app.post("/folders")
def create_folder(body: FolderIn):
    if not body.name.strip():
        raise HTTPException(400, "폴더 이름이 비었어요")
    with connect() as conn:
        cur = conn.execute("INSERT INTO folders (name, parent_id) VALUES (?, ?)", (body.name.strip(), body.parent_id))
        return dict(conn.execute("SELECT * FROM folders WHERE id = ?", (cur.lastrowid,)).fetchone())


@app.patch("/folders/{folder_id}")
def rename_folder(folder_id: int, body: FolderPatch):
    with connect() as conn:
        if body.name:
            conn.execute("UPDATE folders SET name = ? WHERE id = ?", (body.name.strip(), folder_id))
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "폴더가 없어요")
    return dict(row)


@app.delete("/folders/{folder_id}")
def delete_folder(folder_id: int):
    # 안에 있던 자료와 하위 폴더는 지우지 않고 한 칸 위 폴더로 올린다
    with connect() as conn:
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "폴더가 없어요")
        parent = row["parent_id"]
        conn.execute("UPDATE folders SET parent_id = ? WHERE parent_id = ?", (parent, folder_id))
        conn.execute("UPDATE materials SET folder_id = ? WHERE folder_id = ?", (parent, folder_id))
        conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
    return {"deleted": folder_id}


# ---------- 자료 (코드, 오브젝트, 이미지) ----------
class MaterialIn(BaseModel):
    title: str
    kind: str = "code"
    content: str
    folder_id: Optional[int] = None
    source: str = "paste"
    path: Optional[str] = None
    class_name: Optional[str] = None


class MaterialPatch(BaseModel):
    folder_id: Optional[int] = None
    title: Optional[str] = None


def _with_latest(conn, row):
    m = dict(row)
    m["latest_revision"] = m["revision"]
    if m["path"]:
        m["latest_revision"] = conn.execute(
            "SELECT MAX(revision) FROM materials WHERE path = ?", (m["path"],)
        ).fetchone()[0]
    return m


@app.get("/materials")
def list_materials(folder_id: Optional[int] = None, inbox: bool = False):
    with connect() as conn:
        if inbox:  # Studio에서 왔는데 아직 폴더에 안 넣은 것
            rows = conn.execute(
                "SELECT * FROM materials WHERE folder_id IS NULL AND source = 'studio' ORDER BY id DESC"
            )
        elif folder_id is None:
            rows = conn.execute("SELECT * FROM materials ORDER BY id")
        else:
            rows = conn.execute("SELECT * FROM materials WHERE folder_id = ? ORDER BY id", (folder_id,))
        return [_with_latest(conn, r) for r in rows.fetchall()]


@app.get("/materials/{material_id}")
def get_material(material_id: int):
    with connect() as conn:
        row = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "자료가 없어요")
        return _with_latest(conn, row)


@app.get("/materials/{material_id}/revisions")
def list_revisions(material_id: int):
    """같은 Studio 경로로 수집된 R1, R2 ... 전부"""
    m = get_material(material_id)
    if not m["path"]:
        return [m]
    with connect() as conn:
        rows = conn.execute("SELECT * FROM materials WHERE path = ? ORDER BY revision", (m["path"],))
        return [_with_latest(conn, r) for r in rows.fetchall()]


def _insert_material(conn, body: MaterialIn):
    revision = 1
    if body.path:  # 같은 경로를 전에 받은 적 있으면 다음 번호
        last = conn.execute("SELECT MAX(revision) FROM materials WHERE path = ?", (body.path,)).fetchone()[0]
        revision = (last or 0) + 1
    cur = conn.execute(
        "INSERT INTO materials (folder_id, title, kind, content, source, path, class_name, revision)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (body.folder_id, body.title, body.kind, body.content, body.source, body.path, body.class_name, revision),
    )
    return _with_latest(conn, conn.execute("SELECT * FROM materials WHERE id = ?", (cur.lastrowid,)).fetchone())


@app.post("/materials")
def create_material(body: MaterialIn):
    with connect() as conn:
        return _insert_material(conn, body)


@app.patch("/materials/{material_id}")
def update_material(material_id: int, body: MaterialPatch):
    fields = body.model_dump(exclude_unset=True)  # 보낸 칸만 바꾼다 (folder_id: null 은 '받은 자료'로 되돌리기)
    with connect() as conn:
        if "folder_id" in fields:
            conn.execute("UPDATE materials SET folder_id = ? WHERE id = ?", (fields["folder_id"], material_id))
        if fields.get("title"):
            conn.execute("UPDATE materials SET title = ? WHERE id = ?", (fields["title"], material_id))
    return get_material(material_id)


@app.delete("/materials/{material_id}")
def delete_material(material_id: int):
    with connect() as conn:
        conn.execute("DELETE FROM materials WHERE id = ?", (material_id,))
    return {"deleted": material_id}


# ---------- Studio 플러그인 ----------
class StudioItem(BaseModel):
    title: str
    kind: str  # 'code' 또는 'object'
    content: str
    path: str
    class_name: Optional[str] = None


class StudioBatch(BaseModel):
    items: List[StudioItem]


@app.post("/studio/collect")
def studio_collect(body: StudioBatch):
    """플러그인이 선택한 것들을 한 번에 보낸다. 같은 경로는 R1, R2 ... 로 쌓인다"""
    with connect() as conn:
        return [
            _insert_material(conn, MaterialIn(**item.model_dump(), source="studio"))
            for item in body.items
        ]


# ---------- 이미지 업로드 ----------
@app.post("/uploads")
async def upload_image(file: UploadFile, folder_id: Optional[int] = None, attach: bool = False):
    """attach=true 면 댓글 첨부용 (트리에도 받은 자료에도 안 보인다)"""
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "이미지 파일만 올릴 수 있어요")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "10MB 이하 이미지만 올릴 수 있어요")
    name = f"{uuid.uuid4().hex}{Path(file.filename or '').suffix.lower()}"
    (UPLOAD_DIR / name).write_bytes(data)
    return create_material(MaterialIn(
        title=file.filename or name, kind="image", content=f"/uploads/{name}",
        folder_id=None if attach else folder_id, source="comment" if attach else "upload",
    ))
