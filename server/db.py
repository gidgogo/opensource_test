import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

HERE = Path(__file__).parent
# 테스트할 때는 APP_DB 환경변수로 다른 파일을 쓴다
DB_PATH = Path(os.environ.get("APP_DB", HERE / "app.db"))


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # 결과를 dict처럼 꺼낼 수 있게
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with connect() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS folders (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            parent_id  INTEGER REFERENCES folders(id),     -- NULL이면 맨 위 폴더
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS materials (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id  INTEGER REFERENCES folders(id),     -- NULL + source='studio' 이면 '받은 자료'
            title      TEXT NOT NULL,
            kind       TEXT NOT NULL,                       -- 'code', 'object', 'image'
            content    TEXT,                                -- 코드 본문, 속성 JSON, 이미지 주소
            source     TEXT NOT NULL DEFAULT 'paste',       -- 'paste', 'upload', 'studio', 'comment'
            path       TEXT,                                -- Studio 경로 예: ServerScriptService.BossAI
            class_name TEXT,                                -- Studio 클래스 예: Script, Part
            revision   INTEGER NOT NULL DEFAULT 1,          -- 같은 path를 몇 번째로 수집했는지 (R1, R2...)
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_materials_folder ON materials(folder_id);
        CREATE INDEX IF NOT EXISTS idx_materials_path ON materials(path);
        """)
