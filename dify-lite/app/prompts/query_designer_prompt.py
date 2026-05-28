from __future__ import annotations

import json
from typing import Any


def build_query_designer_prompt(
    *,
    question: str,
    history: list[dict[str, str]] | None = None,
    scene: str = "general",
    context: dict[str, Any] | None = None,
) -> str:
    history_payload = [
        {"role": item.get("role", ""), "content": item.get("content", "")[:300]}
        for item in (history or [])[-6:]
        if item.get("content")
    ]
    payload = {
        "scene": scene,
        "question": question,
        "history": history_payload,
        "context": context or {},
    }
    return (
        "You are Query Designer for a software-development RAG assistant.\n"
        "Your job is to create 1 to 3 retrieval queries for project documents, design notes, API specs, code explanations, "
        "handover notes, and test materials.\n"
        "Rules:\n"
        "1. Stay close to the user's question.\n"
        "2. Prefer document-searchable wording.\n"
        "3. Do not invent technologies, frameworks, or modules that are not stated.\n"
        "4. If the user's question is already precise, keep the original question as one query.\n"
        "5. Return JSON only.\n\n"
        "Output schema:\n"
        '{\n  "queries": ["query 1", "query 2"],\n  "reason": "short reason"\n}\n\n'
        f"Input:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )
