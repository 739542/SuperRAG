from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import Settings


class WeaviateStore:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._headers = {"Content-Type": "application/json"}
        if settings.weaviate_api_key:
            self._headers["Authorization"] = f"Bearer {settings.weaviate_api_key}"

    def ensure_schema(self) -> None:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(f"{self._settings.weaviate_url}/v1/schema", headers=self._headers)
            response.raise_for_status()
            classes = response.json().get("classes", [])
            if any(item.get("class") == self._settings.weaviate_class_name for item in classes):
                return

            schema = {
                "class": self._settings.weaviate_class_name,
                "description": "Slim Dify RAG chunks",
                "vectorizer": "none",
                "properties": [
                    {"name": "collection_id", "dataType": ["text"]},
                    {"name": "document_id", "dataType": ["text"]},
                    {"name": "chunk_id", "dataType": ["text"]},
                    {"name": "source_name", "dataType": ["text"]},
                    {"name": "content", "dataType": ["text"]},
                    {"name": "metadata_json", "dataType": ["text"]},
                ],
            }
            create_response = client.post(
                f"{self._settings.weaviate_url}/v1/schema",
                headers=self._headers,
                json=schema,
            )
            create_response.raise_for_status()

    def index_chunks(self, chunks: list[dict[str, Any]], vectors: list[list[float]]) -> None:
        self.ensure_schema()
        objects = []
        for chunk, vector in zip(chunks, vectors, strict=True):
            objects.append(
                {
                    "class": self._settings.weaviate_class_name,
                    "id": chunk["id"],
                    "properties": {
                        "collection_id": chunk["collection_id"],
                        "document_id": chunk["document_id"],
                        "chunk_id": chunk["id"],
                        "source_name": chunk["metadata"]["source_name"],
                        "content": chunk["content"],
                        "metadata_json": json.dumps(chunk["metadata"], ensure_ascii=True),
                    },
                    "vector": vector,
                }
            )
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{self._settings.weaviate_url}/v1/batch/objects",
                headers=self._headers,
                json={"objects": objects},
            )
            response.raise_for_status()

    def vector_search(self, collection_id: str, vector: list[float], limit: int) -> list[dict[str, Any]]:
        self.ensure_schema()
        vector_literal = ",".join(f"{value:.8f}" for value in vector)
        query = (
            "{ Get { "
            f"{self._settings.weaviate_class_name}("
            f'where:{{path:["collection_id"],operator:Equal,valueText:"{collection_id}"}} '
            f"nearVector:{{vector:[{vector_literal}]}} "
            f"limit:{limit}"
            ") { chunk_id content source_name metadata_json "
            "_additional { id distance certainty } } } }"
        )
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{self._settings.weaviate_url}/v1/graphql",
                headers=self._headers,
                json={"query": query},
            )
            response.raise_for_status()
            payload = response.json()
        return payload.get("data", {}).get("Get", {}).get(self._settings.weaviate_class_name, [])
