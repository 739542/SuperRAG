from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator
from uuid import uuid4

from app.config import Settings


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Repository:
    def __init__(self, settings: Settings):
        self._db_path = Path(settings.db_path)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
        finally:
            connection.close()

    def list_collections(self) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, name, description, created_at FROM collections ORDER BY created_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def create_collection(self, name: str, description: str) -> dict:
        record = {
            "id": str(uuid4()),
            "name": name.strip(),
            "description": description.strip(),
            "created_at": utc_now(),
        }
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO collections (id, name, description, created_at)
                VALUES (:id, :name, :description, :created_at)
                """,
                record,
            )
            connection.commit()
        return record

    def get_collection_by_name(self, name: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id, name, description, created_at FROM collections WHERE name = ?",
                (name.strip(),),
            ).fetchone()
        return dict(row) if row else None

    def get_collection(self, collection_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id, name, description, created_at FROM collections WHERE id = ?",
                (collection_id,),
            ).fetchone()
        return dict(row) if row else None

    def save_document(
        self,
        *,
        collection_id: str,
        filename: str,
        original_name: str,
        title: str,
        doc_type: str,
        project: str,
        version: str,
        scene: str,
        summary: str,
        status: str,
        content_type: str,
        char_count: int,
        chunks: list[dict],
    ) -> dict:
        document = {
            "id": str(uuid4()),
            "collection_id": collection_id,
            "filename": filename,
            "original_name": original_name,
            "title": title.strip(),
            "doc_type": doc_type.strip(),
            "project": project.strip(),
            "version": version.strip(),
            "scene": scene.strip(),
            "summary": summary.strip(),
            "status": status.strip(),
            "content_type": content_type,
            "char_count": char_count,
            "chunk_count": len(chunks),
            "created_at": utc_now(),
        }
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO documents (
                    id, collection_id, filename, original_name, content_type,
                    title, doc_type, project, version, scene, summary, status,
                    char_count, chunk_count, created_at
                ) VALUES (
                    :id, :collection_id, :filename, :original_name, :content_type,
                    :title, :doc_type, :project, :version, :scene, :summary, :status,
                    :char_count, :chunk_count, :created_at
                )
                """,
                document,
            )
            connection.executemany(
                """
                INSERT INTO chunks (
                    id, document_id, collection_id, position, content,
                    cleaned_content, token_count, metadata_json
                ) VALUES (
                    :id, :document_id, :collection_id, :position, :content,
                    :cleaned_content, :token_count, :metadata_json
                )
                """,
                [
                    {
                        **chunk,
                        "document_id": document["id"],
                        "collection_id": collection_id,
                        "metadata_json": json.dumps(chunk["metadata"], ensure_ascii=True),
                    }
                    for chunk in chunks
                ],
            )
            connection.commit()
        return document

    def update_document_status(self, document_id: str, status: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE documents SET status = ? WHERE id = ?",
                (status.strip(), document_id),
            )
            connection.commit()

    def get_document(self, document_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT d.id, d.collection_id, c.name AS collection_name, d.filename, d.original_name,
                       d.title, d.doc_type, d.project, d.version, d.scene, d.summary, d.status,
                       d.content_type, d.char_count, d.chunk_count, d.created_at
                FROM documents d
                LEFT JOIN collections c ON c.id = d.collection_id
                WHERE d.id = ?
                """,
                (document_id,),
            ).fetchone()
        return dict(row) if row else None

    def find_document_by_source_name(self, source_name: str) -> dict | None:
        value = source_name.strip()
        if not value:
            return None
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT d.id, d.collection_id, c.name AS collection_name, d.filename, d.original_name,
                       d.title, d.doc_type, d.project, d.version, d.scene, d.summary, d.status,
                       d.content_type, d.char_count, d.chunk_count, d.created_at
                FROM documents d
                LEFT JOIN collections c ON c.id = d.collection_id
                WHERE d.original_name = ? OR d.title = ? OR d.filename = ?
                ORDER BY d.created_at DESC
                LIMIT 1
                """,
                (value, value, value),
            ).fetchone()
        return dict(row) if row else None

    def delete_document(self, document_id: str) -> dict | None:
        document = self.get_document(document_id)
        if not document:
            return None

        with self._connect() as connection:
            connection.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
            connection.execute("DELETE FROM documents WHERE id = ?", (document_id,))
            connection.commit()
        return document

    def list_documents(self, collection_id: str | None = None) -> list[dict]:
        query = """
            SELECT d.id, d.collection_id, c.name AS collection_name, d.filename, d.original_name,
                   d.title, d.doc_type, d.project, d.version, d.scene, d.summary, d.status,
                   d.content_type, d.char_count, d.chunk_count, d.created_at
            FROM documents d
            LEFT JOIN collections c ON c.id = d.collection_id
        """
        params: tuple = ()
        if collection_id:
            query += " WHERE d.collection_id = ?"
            params = (collection_id,)
        query += " ORDER BY d.created_at DESC"
        with self._connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def get_chunks_for_collection(self, collection_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, document_id, collection_id, position, content,
                       cleaned_content, token_count, metadata_json
                FROM chunks
                WHERE collection_id = ?
                ORDER BY position ASC
                """,
                (collection_id,),
            ).fetchall()
        records = []
        for row in rows:
            record = dict(row)
            record["metadata"] = json.loads(record.pop("metadata_json"))
            records.append(record)
        return records

    def get_chunks_for_document(self, document_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, document_id, collection_id, position, content,
                       cleaned_content, token_count, metadata_json
                FROM chunks
                WHERE document_id = ?
                ORDER BY position ASC
                """,
                (document_id,),
            ).fetchall()
        records = []
        for row in rows:
            record = dict(row)
            record["metadata"] = json.loads(record.pop("metadata_json"))
            records.append(record)
        return records

    def get_chunk(self, chunk_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, document_id, collection_id, position, content,
                       cleaned_content, token_count, metadata_json
                FROM chunks
                WHERE id = ?
                LIMIT 1
                """,
                (chunk_id,),
            ).fetchone()
        if not row:
            return None
        record = dict(row)
        record["metadata"] = json.loads(record.pop("metadata_json"))
        return record

    def save_artifact(self, record: dict) -> dict:
        now = utc_now()
        artifact = {
            "id": record.get("id") or str(uuid4()),
            "scene": record.get("scene") or "general",
            "artifact_type": record.get("artifact_type") or record.get("artifactType") or record.get("scene") or "general",
            "title": record.get("title") or "未命名历史产物",
            "query": record.get("query") or "",
            "project": record.get("project") or "",
            "output_summary": record.get("output_summary") or record.get("outputSummary") or record.get("summary") or "",
            "structured_output_json": json.dumps(record.get("structured_output") or record.get("structuredOutput") or {}, ensure_ascii=True),
            "citations_json": json.dumps(record.get("citations") or [], ensure_ascii=True),
            "quality_assessment_json": json.dumps(
                record.get("quality_assessment") or record.get("qualityAssessment") or {},
                ensure_ascii=True,
            ),
            "review_status": record.get("review_status") or record.get("reviewStatus") or "草稿",
            "human_notes": record.get("human_notes") or record.get("humanNotes") or "",
            "creator": record.get("creator") or "course-demo-user",
            "created_at": record.get("created_at") or record.get("createdAt") or now,
            "updated_at": now,
        }
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO artifacts (
                    id, scene, artifact_type, title, query, project, output_summary,
                    structured_output_json, citations_json, quality_assessment_json,
                    review_status, human_notes, creator, created_at, updated_at
                ) VALUES (
                    :id, :scene, :artifact_type, :title, :query, :project, :output_summary,
                    :structured_output_json, :citations_json, :quality_assessment_json,
                    :review_status, :human_notes, :creator, :created_at, :updated_at
                )
                ON CONFLICT(id) DO UPDATE SET
                    scene = excluded.scene,
                    artifact_type = excluded.artifact_type,
                    title = excluded.title,
                    query = excluded.query,
                    project = excluded.project,
                    output_summary = excluded.output_summary,
                    structured_output_json = excluded.structured_output_json,
                    citations_json = excluded.citations_json,
                    quality_assessment_json = excluded.quality_assessment_json,
                    review_status = excluded.review_status,
                    human_notes = excluded.human_notes,
                    creator = excluded.creator,
                    updated_at = excluded.updated_at
                """,
                artifact,
            )
            connection.commit()
        return self.get_artifact(artifact["id"]) or artifact

    def list_artifacts(self, *, scene: str = "", project: str = "", keyword: str = "") -> list[dict]:
        query = """
            SELECT id, scene, artifact_type, title, query, project, output_summary,
                   structured_output_json, citations_json, quality_assessment_json,
                   review_status, human_notes, creator, created_at, updated_at
            FROM artifacts
            WHERE 1 = 1
        """
        params: list[str] = []
        if scene:
            query += " AND scene = ?"
            params.append(scene)
        if project:
            query += " AND project = ?"
            params.append(project)
        if keyword:
            query += " AND (title LIKE ? OR query LIKE ? OR output_summary LIKE ?)"
            like_value = f"%{keyword}%"
            params.extend([like_value, like_value, like_value])
        query += " ORDER BY created_at DESC"
        with self._connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._decode_artifact(dict(row)) for row in rows]

    def get_artifact(self, artifact_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, scene, artifact_type, title, query, project, output_summary,
                       structured_output_json, citations_json, quality_assessment_json,
                       review_status, human_notes, creator, created_at, updated_at
                FROM artifacts
                WHERE id = ?
                """,
                (artifact_id,),
            ).fetchone()
        return self._decode_artifact(dict(row)) if row else None

    def count_artifact_versions(self, artifact_id: str) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT COUNT(*) AS total FROM artifact_versions WHERE artifact_id = ?",
                (artifact_id,),
            ).fetchone()
        return int(row["total"] if row else 0)

    def save_artifact_version(
        self,
        *,
        artifact_id: str,
        version: str = "",
        operator: str = "",
        change_summary: str = "",
        snapshot: dict | None = None,
    ) -> dict:
        now = utc_now()
        next_index = self.count_artifact_versions(artifact_id) + 1
        record = {
            "id": str(uuid4()),
            "artifact_id": artifact_id,
            "version": version.strip() or f"v{next_index}",
            "operator": operator.strip() or "course-demo-user",
            "change_summary": change_summary.strip() or "保存产物版本快照",
            "snapshot_json": json.dumps(snapshot or {}, ensure_ascii=True),
            "created_at": now,
        }
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO artifact_versions (
                    id, artifact_id, version, operator, change_summary, snapshot_json, created_at
                ) VALUES (
                    :id, :artifact_id, :version, :operator, :change_summary, :snapshot_json, :created_at
                )
                """,
                record,
            )
            connection.commit()
        return self._decode_artifact_version(record)

    def list_artifact_versions(self, artifact_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, artifact_id, version, operator, change_summary, snapshot_json, created_at
                FROM artifact_versions
                WHERE artifact_id = ?
                ORDER BY created_at DESC
                """,
                (artifact_id,),
            ).fetchall()
        return [self._decode_artifact_version(dict(row)) for row in rows]

    def update_artifact_review(self, artifact_id: str, *, review_status: str, human_notes: str) -> dict | None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE artifacts
                SET review_status = ?, human_notes = ?, updated_at = ?
                WHERE id = ?
                """,
                (review_status.strip() or "待复核", human_notes.strip(), utc_now(), artifact_id),
            )
            connection.commit()
        return self.get_artifact(artifact_id)

    def delete_artifact(self, artifact_id: str) -> bool:
        with self._connect() as connection:
            connection.execute("DELETE FROM artifact_versions WHERE artifact_id = ?", (artifact_id,))
            cursor = connection.execute("DELETE FROM artifacts WHERE id = ?", (artifact_id,))
            connection.commit()
        return cursor.rowcount > 0

    def _decode_artifact(self, record: dict) -> dict:
        record["structured_output"] = _loads_json(record.pop("structured_output_json", "{}"), {})
        record["citations"] = _loads_json(record.pop("citations_json", "[]"), [])
        record["quality_assessment"] = _loads_json(record.pop("quality_assessment_json", "{}"), {})
        return record

    def _decode_artifact_version(self, record: dict) -> dict:
        record["snapshot"] = _loads_json(record.pop("snapshot_json", "{}"), {})
        return record


def _loads_json(value: str, fallback):
    try:
        return json.loads(value or "")
    except (TypeError, json.JSONDecodeError):
        return fallback
