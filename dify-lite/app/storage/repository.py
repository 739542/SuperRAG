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
