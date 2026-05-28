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
        "scene_guidance": scene_guidance,
        "evidence_bundle": evidence_bundle,
    }
    return (
        "You are Answer Generator in an AUCMR-inspired multi-stage RAG pipeline for software-development assistance.\n"
        "You must produce the final answer using the evidence bundle as the primary grounding source.\n\n"
        "Objective:\n"
        "- Read the question, the recent history, the evidence bundle, and any scene-specific guidance.\n"
        "- Generate a clear grounded answer suitable for software-development support, such as requirement understanding, module explanation, interface analysis, implementation guidance, code-change advice, or testing suggestions.\n"
        "- Distinguish confirmed project facts from optional implementation suggestions.\n"
        "- Explicitly expose uncertainty where evidence is missing or incomplete.\n\n"
        "Generation rules:\n"
        "- Use only the provided evidence bundle and brief recent history.\n"
        "- Do not add unverified project facts.\n"
        "- If evidence is insufficient, say so instead of guessing.\n"
        "- Keep key conclusions traceable to evidence where possible.\n"
        "- Suggestions may extend beyond explicit document text, but they must be framed as optional recommendations rather than established facts.\n\n"
        "Output constraints:\n"
        "- Return JSON only.\n"
        "- Keep the answer usable for frontend display.\n\n"
        "Output JSON schema:\n"
        "{\n"
        '  "answer": "final grounded answer",\n'
        '  "implementation_suggestions": ["optional suggestion 1", "optional suggestion 2"],\n'
        '  "evidence_mapping": [\n'
        "    {\n"
        '      "claim": "key conclusion",\n'
        '      "evidence": ["source#section", "source#section"]\n'
        "    }\n"
        "  ],\n"
        '  "uncertain_points": ["point requiring confirmation"],\n'
        '  "key_claims": ["claim 1", "claim 2"]\n'
        "}\n\n"
        f"Input:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )
