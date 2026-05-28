from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

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

        return self._retrieve_core(collection=collection, collection_id=collection_id, query=query, top_k=top_k)

    def retrieve_many(self, *, collection_id: str, queries: list[str], top_k: int = 5) -> dict:
        collection = self._repository.get_collection(collection_id)
        if not collection:
            raise ValueError("collection_id does not exist")

        normalized_queries: list[str] = []
        seen_queries: set[str] = set()
        for raw_query in queries:
            query = raw_query.strip()
            if not query or query in seen_queries:
                continue
            seen_queries.add(query)
            normalized_queries.append(query)

        if not normalized_queries:
            raise ValueError("at least one query is required")

        merged_hits: dict[str, dict[str, Any]] = {}
        warnings: list[str] = []
        per_query_top_k = max(top_k, min(top_k * 2, 8))

        for query in normalized_queries:
            result = self._retrieve_core(
                collection=collection,
                collection_id=collection_id,
                query=query,
                top_k=per_query_top_k,
            )
            if result.get("warning"):
                warnings.append(result["warning"])

            for hit in result["hits"]:
                chunk_id = hit["id"]
                existing = merged_hits.get(chunk_id)
                if existing:
                    existing["score"] = max(existing["score"], hit["score"])
                    existing["vector_score"] = max(existing["vector_score"], hit["vector_score"])
                    existing["lexical_score"] = max(existing["lexical_score"], hit["lexical_score"])
                    existing["matched_queries"] = sorted({*existing["matched_queries"], query})
                    continue

                merged_hits[chunk_id] = {
                    **hit,
                    "matched_queries": [query],
                }

        ranked = sorted(
            merged_hits.values(),
            key=lambda item: (item["score"], len(item.get("matched_queries", []))),
            reverse=True,
        )

        result = {
            "collection": collection,
            "query": normalized_queries[0],
            "queries": normalized_queries,
            "hits": ranked[:top_k],
        }
        if warnings:
            result["warning"] = "; ".join(sorted(set(warnings)))
        return result

    def _retrieve_core(self, *, collection: dict, collection_id: str, query: str, top_k: int) -> dict:
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
            chunk_record = self._repository.get_chunk(chunk_id)
            distance = hit.get("_additional", {}).get("distance")
            certainty = hit.get("_additional", {}).get("certainty")
            vector_score = certainty if certainty is not None else max(0.0, 1.0 - float(distance or 1.0))
            merged_scores[chunk_id]["vector"] = max(vector_score, merged_scores[chunk_id]["vector"])
            merged_metadata = json.loads(hit.get("metadata_json", "{}") or "{}")
            if chunk_record:
                merged_metadata = {
                    **chunk_record.get("metadata", {}),
                    **merged_metadata,
                }
            merged_scores[chunk_id]["payload"] = {
                "id": chunk_id,
                "document_id": hit.get("document_id", ""),
                "content": hit.get("content", ""),
                "position": chunk_record.get("position", 0) if chunk_record else 0,
                "metadata": {
                    **merged_metadata,
                    "source_name": hit.get("source_name") or "",
                },
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
                    "document_id": payload.get("document_id", ""),
                    "score": round(final_score, 6),
                    "vector_score": round(scores["vector"], 6),
                    "lexical_score": round(scores["lexical"], 6),
                    "content": payload["content"],
                    "position": int(payload.get("position", 0) or 0),
                    "metadata": payload["metadata"],
                }
            )

        ranked.sort(key=lambda item: item["score"], reverse=True)
        result = {"collection": collection, "query": query, "hits": ranked[:top_k]}
        if vector_error:
            result["warning"] = f"vector search unavailable: {vector_error}"
        return result
