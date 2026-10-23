import os
import tempfile

# 진짜 app.db를 건드리지 않도록 임시 폴더를 쓴다
_tmp = tempfile.mkdtemp()
os.environ["APP_DB"] = os.path.join(_tmp, "test.db")
os.environ["UPLOAD_DIR"] = os.path.join(_tmp, "uploads")

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def test_health_and_cors():
    r = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert r.json() == {"status": "ok"}
    assert r.headers["access-control-allow-origin"] == "*"


def test_folder_tree_and_materials():
    boss = client.post("/folders", json={"name": "보스 전투"}).json()
    phase = client.post("/folders", json={"name": "2페이즈", "parent_id": boss["id"]}).json()
    assert phase["parent_id"] == boss["id"]

    m = client.post("/materials", json={"title": "BossAI", "content": "print(1)", "folder_id": phase["id"]}).json()
    assert [x["id"] for x in client.get(f"/materials?folder_id={phase['id']}").json()] == [m["id"]]

    # 하위 폴더를 지우면 자료는 위 폴더로 올라간다
    client.delete(f"/folders/{phase['id']}")
    assert client.get(f"/materials/{m['id']}").json()["folder_id"] == boss["id"]


def test_studio_inbox_revisions_and_move():
    item = {"title": "BossAttack", "kind": "code", "content": "-- v1", "path": "ServerScriptService.BossAttack",
            "class_name": "Script"}
    r1 = client.post("/studio/collect", json={"items": [item]}).json()[0]
    r2 = client.post("/studio/collect", json={"items": [{**item, "content": "-- v2"}]}).json()[0]
    assert (r1["revision"], r2["revision"]) == (1, 2)
    assert client.get(f"/materials/{r1['id']}").json()["latest_revision"] == 2

    inbox = [x["id"] for x in client.get("/materials?inbox=true").json()]
    assert r1["id"] in inbox and r2["id"] in inbox
    assert [x["revision"] for x in client.get(f"/materials/{r1['id']}/revisions").json()] == [1, 2]

    folder = client.post("/folders", json={"name": "보스 공격"}).json()
    client.patch(f"/materials/{r2['id']}", json={"folder_id": folder["id"]})
    inbox = [x["id"] for x in client.get("/materials?inbox=true").json()]
    assert r2["id"] not in inbox


def test_image_upload():
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    r = client.post("/uploads?attach=true", files={"file": ("shot.png", png, "image/png")}).json()
    assert r["kind"] == "image" and r["source"] == "comment"
    assert client.get(r["content"]).content == png

    bad = client.post("/uploads", files={"file": ("a.txt", b"hi", "text/plain")})
    assert bad.status_code == 400
