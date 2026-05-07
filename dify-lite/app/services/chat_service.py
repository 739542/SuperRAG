from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings
from app.services.retrieval_service import RetrievalService


class ChatService:
    def __init__(self, settings: Settings, retrieval_service: RetrievalService):
        self._settings = settings
        self._retrieval_service = retrieval_service

    def answer(
        self,
        *,
        collection_id: str,
        query: str,
        top_k: int = 5,
        history: list[dict[str, str]] | None = None,
        model_name: str | None = None,
        system_prompt: str | None = None,
    ) -> dict[str, Any]:
        retrieval = self._retrieval_service.retrieve(collection_id=collection_id, query=query, top_k=top_k)
        context_chunks = retrieval["hits"][: self._settings.max_context_chunks]
        context_text = "\n\n".join(
            f"[Chunk {index + 1}] {item['content']}" for index, item in enumerate(context_chunks)
        )

        messages = [
            {
                "role": "system",
                "content": system_prompt
                or (
                    "You are a slim Dify-style RAG assistant. "
                    "Answer only with the provided context when possible. "
                    "If the context is insufficient, say so clearly."
                ),
            }
        ]
        for message in history or []:
            if message.get("role") in {"system", "user", "assistant"} and message.get("content"):
                messages.append({"role": message["role"], "content": message["content"]})
        messages.append({"role": "user", "content": f"Context:\n{context_text}\n\nQuestion:\n{query}"})

        if self._settings.model_base_url and self._settings.model_name:
            answer = self._call_openai_compatible(messages, model_name or self._settings.model_name)
            provider = "openai-compatible"
        else:
            answer = self._mock_answer(query, context_chunks)
            provider = "mock"

        return {
            "query": query,
            "answer": answer,
            "provider": provider,
            "model": model_name or self._settings.model_name or "mock-rag-summary",
            "citations": context_chunks,
        }

    def _call_openai_compatible(self, messages: list[dict[str, str]], model_name: str) -> str:
        payload = {"model": model_name, "messages": messages, "temperature": 0.2}
        headers = {
            "Authorization": f"Bearer {self._settings.model_api_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=self._settings.model_timeout_seconds) as client:
            response = client.post(
                f"{self._settings.model_base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"]

    def _mock_answer(self, query: str, context_chunks: list[dict[str, Any]]) -> str:
        if not context_chunks:
            return "No relevant context was found for this question."
        preview = "\n".join(
            f"- {chunk['content'][:220]}{'...' if len(chunk['content']) > 220 else ''}" for chunk in context_chunks[:3]
        )
        return (
            "Model endpoint is not configured yet, so this is a retrieval-only answer.\n\n"
            f"Question: {query}\n\n"
            f"Most relevant context:\n{preview}"
        )
