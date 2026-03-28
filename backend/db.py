from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any

DB_PATH = os.path.join(os.path.dirname(__file__), "alchemist.db")
_DB_READY = False


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    global _DB_READY
    conn = _get_conn()
    with conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                value TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                current_version INTEGER NOT NULL,
                auth_enabled INTEGER NOT NULL DEFAULT 0,
                api_key TEXT,
                created REAL NOT NULL,
                updated REAL NOT NULL,
                runs INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        _ensure_column(conn, "workflows", "api_key_preview", "TEXT")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflow_versions (
                workflow_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                nodes_json TEXT NOT NULL,
                edges_json TEXT NOT NULL,
                created REAL NOT NULL,
                PRIMARY KEY (workflow_id, version),
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflow_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                client_ip TEXT,
                status_code INTEGER NOT NULL,
                elapsed_ms REAL,
                request_body_json TEXT,
                error_text TEXT,
                created REAL NOT NULL,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            )
            """
        )

        count = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO items (name, value) VALUES (?, ?)",
                [
                    ("alpha", "100"),
                    ("beta", "200"),
                    ("gamma", "300"),
                ],
            )

        product_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if product_count == 0:
            conn.executemany(
                """
                INSERT INTO products (name, category, price, stock)
                VALUES (?, ?, ?, ?)
                """,
                [
                    ("Classic Sneakers", "Shoes", 89.0, 24),
                    ("Minimal Backpack", "Accessories", 59.0, 16),
                    ("Everyday Hoodie", "Apparel", 49.0, 32),
                ],
            )
    conn.close()
    _DB_READY = True


def _ensure_db():
    if not _DB_READY:
        init_db()


def execute_query(sql: str, params: list | None = None) -> list[dict]:
    _ensure_db()
    conn = _get_conn()
    try:
        with conn:
            cur = conn.execute(sql, params or [])
            if cur.description:
                rows = [dict(row) for row in cur.fetchall()]
                return rows
            return [{"affected": cur.rowcount}]
    finally:
        conn.close()


def _load_workflow(conn: sqlite3.Connection, workflow_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT
            w.id,
            w.name,
            w.current_version,
            w.auth_enabled,
            w.api_key,
            w.api_key_preview,
            w.created,
            w.updated,
            w.runs,
            v.nodes_json,
            v.edges_json
        FROM workflows w
        JOIN workflow_versions v
          ON v.workflow_id = w.id
         AND v.version = w.current_version
        WHERE w.id = ?
        """,
        (workflow_id,),
    ).fetchone()

    if row is None:
        return None

    return {
        "id": row["id"],
        "name": row["name"],
        "version": row["current_version"],
        "nodes": json.loads(row["nodes_json"]),
        "edges": json.loads(row["edges_json"]),
        "auth_enabled": bool(row["auth_enabled"]),
        "api_key_hash": row["api_key"],
        "api_key_preview": row["api_key_preview"] if "api_key_preview" in row.keys() else None,
        "created": row["created"],
        "updated": row["updated"],
        "runs": row["runs"],
    }


def save_workflow(
    workflow_id: str,
    name: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    auth_enabled: bool,
    api_key_hash: str | None,
    api_key_preview: str | None,
) -> dict[str, Any]:
    _ensure_db()
    now = time.time()
    conn = _get_conn()
    try:
        with conn:
            existing = conn.execute(
                "SELECT current_version, created, runs FROM workflows WHERE id = ?",
                (workflow_id,),
            ).fetchone()

            if existing is None:
                version = 1
                conn.execute(
                    """
                    INSERT INTO workflows (
                        id, name, current_version, auth_enabled, api_key, api_key_preview, created, updated, runs
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        workflow_id,
                        name,
                        version,
                        int(auth_enabled),
                        api_key_hash,
                        api_key_preview,
                        now,
                        now,
                    ),
                )
            else:
                version = int(existing["current_version"]) + 1
                conn.execute(
                    """
                    UPDATE workflows
                    SET name = ?, current_version = ?, auth_enabled = ?, api_key = ?, api_key_preview = ?, updated = ?
                    WHERE id = ?
                    """,
                    (
                        name,
                        version,
                        int(auth_enabled),
                        api_key_hash,
                        api_key_preview,
                        now,
                        workflow_id,
                    ),
                )

            conn.execute(
                """
                INSERT INTO workflow_versions (
                    workflow_id, version, nodes_json, edges_json, created
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    workflow_id,
                    version,
                    json.dumps(nodes),
                    json.dumps(edges),
                    now,
                ),
            )

        return get_workflow(workflow_id)
    finally:
        conn.close()


def get_workflow(workflow_id: str) -> dict[str, Any] | None:
    _ensure_db()
    conn = _get_conn()
    try:
        return _load_workflow(conn, workflow_id)
    finally:
        conn.close()


def list_workflows() -> list[dict[str, Any]]:
    _ensure_db()
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT id FROM workflows ORDER BY updated DESC, created DESC"
        ).fetchall()
        return [
            workflow
            for workflow_id in [row["id"] for row in rows]
            if (workflow := _load_workflow(conn, workflow_id)) is not None
        ]
    finally:
        conn.close()


def count_workflows() -> int:
    _ensure_db()
    conn = _get_conn()
    try:
        return int(conn.execute("SELECT COUNT(*) FROM workflows").fetchone()[0])
    finally:
        conn.close()


def delete_workflow(workflow_id: str) -> bool:
    _ensure_db()
    conn = _get_conn()
    try:
        with conn:
            deleted = conn.execute(
                "DELETE FROM workflows WHERE id = ?",
                (workflow_id,),
            ).rowcount
        return deleted > 0
    finally:
        conn.close()


def increment_workflow_runs(workflow_id: str) -> None:
    _ensure_db()
    conn = _get_conn()
    try:
        with conn:
            conn.execute(
                "UPDATE workflows SET runs = runs + 1, updated = ? WHERE id = ?",
                (time.time(), workflow_id),
            )
    finally:
        conn.close()


def list_workflow_versions(workflow_id: str) -> list[dict[str, Any]]:
    _ensure_db()
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT workflow_id, version, created
            FROM workflow_versions
            WHERE workflow_id = ?
            ORDER BY version DESC
            """,
            (workflow_id,),
        ).fetchall()
        return [
            {
                "workflow_id": row["workflow_id"],
                "version": row["version"],
                "created": row["created"],
            }
            for row in rows
        ]
    finally:
        conn.close()


def record_workflow_log(
    workflow_id: str,
    version: int,
    client_ip: str | None,
    status_code: int,
    elapsed_ms: float | None,
    request_body: Any,
    error_text: str | None = None,
) -> None:
    _ensure_db()
    conn = _get_conn()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO workflow_logs (
                    workflow_id, version, client_ip, status_code, elapsed_ms,
                    request_body_json, error_text, created
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    workflow_id,
                    version,
                    client_ip,
                    status_code,
                    elapsed_ms,
                    json.dumps(request_body),
                    error_text,
                    time.time(),
                ),
            )
    finally:
        conn.close()


def count_recent_requests(workflow_id: str, client_ip: str | None, since_ts: float) -> int:
    _ensure_db()
    conn = _get_conn()
    try:
        row = conn.execute(
            """
            SELECT COUNT(*)
            FROM workflow_logs
            WHERE workflow_id = ?
              AND client_ip = ?
              AND created >= ?
            """,
            (workflow_id, client_ip or "unknown", since_ts),
        ).fetchone()
        return int(row[0])
    finally:
        conn.close()


def list_workflow_logs(workflow_id: str, limit: int = 50) -> list[dict[str, Any]]:
    _ensure_db()
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT id, workflow_id, version, client_ip, status_code, elapsed_ms,
                   request_body_json, error_text, created
            FROM workflow_logs
            WHERE workflow_id = ?
            ORDER BY created DESC
            LIMIT ?
            """,
            (workflow_id, limit),
        ).fetchall()
        return [
            {
                "id": row["id"],
                "workflow_id": row["workflow_id"],
                "version": row["version"],
                "client_ip": row["client_ip"],
                "status_code": row["status_code"],
                "elapsed_ms": row["elapsed_ms"],
                "request_body": json.loads(row["request_body_json"] or "null"),
                "error_text": row["error_text"],
                "created": row["created"],
            }
            for row in rows
        ]
    finally:
        conn.close()


def get_workflow_stats(workflow_id: str) -> dict[str, Any]:
    _ensure_db()
    conn = _get_conn()
    try:
        aggregate = conn.execute(
            """
            SELECT
                COUNT(*) AS total_requests,
                SUM(CASE WHEN status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS success_count,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS failure_count
            FROM workflow_logs
            WHERE workflow_id = ?
            """,
            (workflow_id,),
        ).fetchone()
        last = conn.execute(
            """
            SELECT status_code, elapsed_ms, created
            FROM workflow_logs
            WHERE workflow_id = ?
            ORDER BY created DESC
            LIMIT 1
            """,
            (workflow_id,),
        ).fetchone()
        return {
            "total_requests": int(aggregate["total_requests"] or 0),
            "success_count": int(aggregate["success_count"] or 0),
            "failure_count": int(aggregate["failure_count"] or 0),
            "last_execution_time": last["created"] if last else None,
            "last_status_code": last["status_code"] if last else None,
            "last_elapsed_ms": last["elapsed_ms"] if last else None,
        }
    finally:
        conn.close()
