from __future__ import annotations

import json
from typing import Any


def build_answer_generator_prompt(
    *,
    question: str,
    evidence_bundle: dict[str, Any],
    history: list[dict[str, str]] | None = None,
    scene: str = "general",
    scene_guidance: str = "",
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
        "scene_guidance": scene_guidance,
        "evidence_bundle": evidence_bundle,
    }
    return (
        "You are Answer Generator for a software-development RAG assistant.\n"
        "Generate the answer only from the provided evidence.\n"
        "If evidence is insufficient, clearly mark uncertainty instead of guessing.\n"
        "You may provide implementation suggestions, but separate them from documented facts.\n"
        "Return JSON only.\n\n"
        "Output schema:\n"
        '{\n'
        '  "answer": "final grounded answer",\n'
        '  "implementation_suggestions": ["optional suggestion 1"],\n'
        '  "evidence_mapping": [\n'
        '    {\n'
        '      "claim": "key claim from the answer",\n'
        '      "evidence": ["source#section", "source#section"]\n'
        "    }\n"
        "  ],\n"
        '  "uncertain_points": ["point needing confirmation"],\n'
        '  "key_claims": ["claim 1", "claim 2"]\n'
        "}\n\n"
        f"Input:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )
