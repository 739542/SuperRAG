from __future__ import annotations

import sqlite3

from app.config import Settings


def bootstrap_database(settings: Settings) -> None:
    with sqlite3.connect(settings.db_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                collection_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                title TEXT,
                doc_type TEXT,
                project TEXT,
                version TEXT,
                scene TEXT,
                summary TEXT,
                status TEXT,
                content_type TEXT NOT NULL,
                char_count INTEGER NOT NULL,
                chunk_count INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                collection_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                content TEXT NOT NULL,
                cleaned_content TEXT NOT NULL,
                token_count INTEGER NOT NULL,
                metadata_json TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY,
                scene TEXT NOT NULL,
                artifact_type TEXT,
                title TEXT NOT NULL,
                query TEXT,
                project TEXT,
                output_summary TEXT,
                structured_output_json TEXT NOT NULL,
                citations_json TEXT NOT NULL,
                quality_assessment_json TEXT NOT NULL,
                review_status TEXT NOT NULL,
                human_notes TEXT,
                creator TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS artifact_versions (
                id TEXT PRIMARY KEY,
                artifact_id TEXT NOT NULL,
                version TEXT NOT NULL,
                operator TEXT,
                change_summary TEXT,
                snapshot_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        _ensure_column(connection, "documents", "title", "TEXT")
        _ensure_column(connection, "documents", "doc_type", "TEXT")
        _ensure_column(connection, "documents", "project", "TEXT")
        _ensure_column(connection, "documents", "version", "TEXT")
        _ensure_column(connection, "documents", "scene", "TEXT")
        _ensure_column(connection, "documents", "summary", "TEXT")
        _ensure_column(connection, "documents", "status", "TEXT")
        _ensure_column(connection, "artifacts", "artifact_type", "TEXT")
        _ensure_column(connection, "artifacts", "review_status", "TEXT")
        _ensure_column(connection, "artifacts", "human_notes", "TEXT")
        _ensure_column(connection, "artifacts", "creator", "TEXT")
        _ensure_column(connection, "artifacts", "updated_at", "TEXT")
        connection.commit()


def _ensure_column(connection: sqlite3.Connection, table: str, column: str, column_type: str) -> None:
    try:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
    except sqlite3.OperationalError as exc:
        if "duplicate column name" not in str(exc).lower():
            raise
