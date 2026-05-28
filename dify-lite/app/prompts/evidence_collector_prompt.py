from __future__ import annotations

import json
from typing import Any


def build_evidence_collector_prompt(
    *,
    question: str,
    queries: list[str],
    retrieved_chunks: list[dict[str, Any]],
    scene: str = "general",
) -> str:
    payload = {
        "scene": scene,
        "question": question,
        "queries": queries,
        "retrieved_chunks": retrieved_chunks,
    }
    return (
        "You are Evidence Collector for a software-development RAG assistant.\n"
        "Extract only evidence that is directly supported by the retrieved chunks.\n"
        "Do not answer the final question.\n"
        "Do not invent missing details.\n"
        "Keep source and section so the answer can cite them later.\n"
        "If evidence is weak or missing, say so explicitly.\n"
        "Return JSON only.\n\n"
        "Output schema:\n"
        '{\n'
        '  "evidence": [\n'
        '    {\n'
        '      "source": "document or file name",\n'
        '      "section": "section, page, chunk, or code location",\n'
        '      "content": "verifiable excerpt",\n'
        '      "relevance": "why this matters"\n'
        "    }\n"
        "  ],\n"
        '  "missing_information": ["missing detail 1"]\n'
        "}\n\n"
        f"Input:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )
