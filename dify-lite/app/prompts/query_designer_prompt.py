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
        {
            "role": item.get("role", ""),
            "content": item.get("content", "")[:400],
        }
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
        "You are Query Designer in an AUCMR-inspired multi-stage RAG pipeline for software-development assistance.\n"
        "Your task is to design a very small set of retrieval queries that can help the system gather grounded project evidence.\n\n"
        "Objective:\n"
        "- Read the current software-development question together with recent dialogue context.\n"
        "- Identify what project facts, requirements, interfaces, modules, workflows, or implementation details are still missing.\n"
        "- Produce 1 to 3 retrieval queries that are more retrieval-friendly than the raw question when needed.\n\n"
        "Design principles:\n"
        "- Keep the original question when it is already specific and retrieval-ready.\n"
        "- Prefer queries that match project documentation, requirement text, API descriptions, code explanations, README content, testing material, and handover notes.\n"
        "- Queries may focus on different missing aspects, but they must stay tightly centered on the current question.\n"
        "- Do not generate many near-duplicate queries.\n"
        "- Do not inject unsupported technology assumptions, architecture assumptions, or implementation decisions.\n"
        "- If the context is insufficient for meaningful rewrite, return only the original question.\n\n"
        "Output constraints:\n"
        "- Return JSON only.\n"
        "- Keep queries concise and directly searchable in the project knowledge base.\n\n"
        "Output JSON schema:\n"
        "{\n"
        '  "queries": ["query 1", "query 2", "query 3"],\n'
        '  "reason": "why these queries are needed"\n'
        "}\n\n"
        f"Input:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )
