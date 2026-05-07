from __future__ import annotations

import json
from collections import defaultdict

from app.config import Settings
from app.core.embedding import EmbeddingClient
from app.core.text_utils import lexical_score
from app.core.weaviate_store import WeaviateStore
from app.storage.repository import Repository


class RetrievalService:
    def __init__(self, settings: Settings, repository: Repository):
        self._settings = settings
        self._repository = repository
        self._embedding_client = EmbeddingClient(settings)
        self._weaviate_store = WeaviateStore(settings)

    def retrieve(self, *, collection_id: str, query: str, top_k: int = 5) -> dict:
        collection = self._repository.get_collection(collection_id)
        if not collection:
            raise ValueError("collection_id does not exist")
        if not query.strip():
            raise ValueError("query is required")

        query_vector = self._embedding_client.embed_one(query)
        vector_error = ""
        try:
            vector_hits = self._weaviate_store.vector_search(collection_id, query_vector, max(top_k * 2, top_k))
        except Exception as exc:
            vector_hits = []
            vector_error = str(exc)
        lexical_hits = self._repository.get_chunks_for_collection(collection_id)

        merged_scores: dict[str, dict] = defaultdict(lambda: {"vector": 0.0, "lexical": 0.0, "payload": None})
        for hit in vector_hits:
            chunk_id = hit.get("chunk_id") or hit.get("_additional", {}).get("id")
            if not chunk_id:
                continue
            distance = hit.get("_additional", {}).get("distance")
            certainty = hit.get("_additional", {}).get("certainty")
            vector_score = certainty if certainty is not None else max(0.0, 1.0 - float(distance or 1.0))
            merged_scores[chunk_id]["vector"] = max(vector_score, merged_scores[chunk_id]["vector"])
            merged_scores[chunk_id]["payload"] = {
                "id": chunk_id,
                "content": hit.get("content", ""),
                "metadata": json.loads(hit.get("metadata_json", "{}") or "{}"),
            }

        for chunk in lexical_hits:
            score = lexical_score(query, chunk["content"])
            if score <= 0:
                continue
            merged_scores[chunk["id"]]["lexical"] = score
            if not merged_scores[chunk["id"]]["payload"]:
                merged_scores[chunk["id"]]["payload"] = chunk

        ranked = []
        for chunk_id, scores in merged_scores.items():
            payload = scores["payload"]
            if not payload:
                continue
            final_score = scores["vector"] * 0.65 + scores["lexical"] * 0.35
            ranked.append(
                {
                    "id": chunk_id,
                    "score": round(final_score, 6),
                    "vector_score": round(scores["vector"], 6),
                    "lexical_score": round(scores["lexical"], 6),
                    "content": payload["content"],
                    "metadata": payload["metadata"],
                }
            )

        ranked.sort(key=lambda item: item["score"], reverse=True)
        result = {"collection": collection, "query": query, "hits": ranked[:top_k]}
        if vector_error:
            result["warning"] = f"vector search unavailable: {vector_error}"
        return result
