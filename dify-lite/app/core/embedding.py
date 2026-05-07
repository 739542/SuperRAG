from __future__ import annotations

import hashlib
import math
from collections import Counter

import httpx

from app.config import Settings
from app.core.text_utils import tokenize


class EmbeddingClient:
    def __init__(self, settings: Settings):
        self._settings = settings

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        if (
            self._settings.embedding_engine == "openai"
            and self._settings.embedding_model_name
            and self._settings.model_base_url
            and self._settings.model_api_key
        ):
            return self._embed_openai(texts)
        return [self._embed_hash(text) for text in texts]

    def embed_one(self, text: str) -> list[float]:
        return self.embed_many([text])[0]

    def _embed_hash(self, text: str) -> list[float]:
        vector = [0.0] * self._settings.embedding_dimension
        counts = Counter(tokenize(text))
        if not counts:
            return vector
        for token, count in counts.items():
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self._settings.embedding_dimension
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign * (1.0 + math.log1p(count))
        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            return vector
        return [value / norm for value in vector]

    def _embed_openai(self, texts: list[str]) -> list[list[float]]:
        payload = {"model": self._settings.embedding_model_name, "input": texts}
        headers = {
            "Authorization": f"Bearer {self._settings.model_api_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=self._settings.model_timeout_seconds) as client:
            response = client.post(f"{self._settings.model_base_url}/embeddings", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()["data"]
        return [item["embedding"] for item in data]
