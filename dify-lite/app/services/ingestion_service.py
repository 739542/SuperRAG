from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from app.config import Settings
from app.core.document_loader import load_document
from app.core.embedding import EmbeddingClient
from app.core.text_utils import clean_text, split_text, token_count
from app.core.weaviate_store import WeaviateStore
from app.storage.repository import Repository


class IngestionService:
    def __init__(self, settings: Settings, repository: Repository):
        self._settings = settings
        self._repository = repository
        self._embedding_client = EmbeddingClient(settings)
        self._weaviate_store = WeaviateStore(settings)

    def create_collection(self, name: str, description: str) -> dict:
        return self._repository.create_collection(name=name, description=description)

    def import_document(
        self,
        *,
        collection_id: str,
        upload: FileStorage,
        clean_enabled: bool,
        chunk_size: int | None,
        chunk_overlap: int | None,
        title: str = "",
        doc_type: str = "",
        project: str = "",
        version: str = "",
        scene: str = "",
        summary: str = "",
    ) -> dict:
        collection = self._repository.get_collection(collection_id)
        if not collection:
            raise ValueError("collection_id does not exist")
        if not upload or not upload.filename:
            raise ValueError("file is required")

        safe_name = secure_filename(upload.filename)
        unique_name = f"{uuid4()}_{safe_name}"
        target_path = Path(self._settings.uploads_dir / unique_name)
        upload.save(target_path)

        raw_text = load_document(target_path)
        processed_text = clean_text(raw_text) if clean_enabled else raw_text
        effective_chunk_size = chunk_size or self._settings.default_chunk_size
        effective_chunk_overlap = chunk_overlap or self._settings.default_chunk_overlap
        chunk_texts = split_text(processed_text, effective_chunk_size, effective_chunk_overlap)
        if not chunk_texts:
            raise ValueError("no usable text found in the uploaded file")

        chunks = []
        for position, chunk in enumerate(chunk_texts):
            chunks.append(
                {
                    "id": str(uuid4()),
                    "position": position,
                    "content": chunk,
                    "cleaned_content": chunk,
                    "token_count": token_count(chunk),
                    "metadata": {
                        "source_name": upload.filename,
                        "file_path": os.fspath(target_path),
                        "chunk_size": effective_chunk_size,
                        "chunk_overlap": effective_chunk_overlap,
                    },
                }
            )

        document = self._repository.save_document(
            collection_id=collection_id,
            filename=unique_name,
            original_name=upload.filename,
            title=title or upload.filename,
            doc_type=doc_type,
            project=project or collection["name"],
            version=version,
            scene=scene,
            summary=summary,
            status="已入库",
            content_type=upload.mimetype or "application/octet-stream",
            char_count=len(processed_text),
            chunks=chunks,
        )

        chunks_for_index = [{**chunk, "document_id": document["id"], "collection_id": collection_id} for chunk in chunks]
        warnings: list[str] = []
        try:
            vectors = self._embedding_client.embed_many([chunk["content"] for chunk in chunks_for_index])
            self._weaviate_store.index_chunks(chunks_for_index, vectors)
        except Exception as exc:
            warnings.append(f"向量索引不可用，已回退为仅词法检索: {exc}")
            self._repository.update_document_status(document["id"], "已入库（仅词法检索）")
            document["status"] = "已入库（仅词法检索）"

        return {
            "document": self._repository.get_document(document["id"]) or document,
            "collection": collection,
            "chunks_indexed": len(chunks),
            "warnings": warnings,
        }
