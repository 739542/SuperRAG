from __future__ import annotations

import json
from typing import Any


def build_validator_prompt(
    *,
    question: str,
    answer_bundle: dict[str, Any],
    evidence_bundle: dict[str, Any],
    scene: str = "general",
) -> str:
    payload = {
        "scene": scene,
        "question": question,
        "answer_bundle": answer_bundle,
        "evidence_bundle": evidence_bundle,
    }
    return (
        "You are Validator in an AUCMR-inspired multi-stage RAG pipeline for software-development assistance.\n"
        "Your job is to verify whether the key conclusions in the current answer are supported by the provided evidence bundle.\n\n"
        "Validation goal:\n"
        "- Separate evidence-backed conclusions from unsupported or uncertain conclusions.\n"
        "- Prevent the final answer from presenting unsupported project facts as certain.\n"
        "- Keep optional suggestions separate from documented facts.\n\n"
        "How to judge claims:\n"
        "- valid_claims: the evidence explicitly supports the claim.\n"
        "- unsupported_claims: the evidence does not support the claim, or the claim conflicts with the evidence.\n"
        "- uncertain_claims: the evidence is incomplete, indirect, or insufficient for a firm conclusion.\n\n"
        "Rules:\n"
        "- Use only the provided evidence bundle and answer bundle.\n"
        "- Do not invent new evidence.\n"
        "- Focus on the answer's key claims and important factual conclusions.\n"
        "- If a point is merely a suggestion, it may remain as advice, but it must not be treated as a confirmed fact unless supported.\n"
        "- Return JSON only.\n\n"
        "Output JSON schema:\n"
        "{\n"
        '  "valid_claims": ["claim supported by evidence"],\n'
        '  "unsupported_claims": ["claim not supported by evidence"],\n'
        '  "uncertain_claims": ["claim that may be reasonable but still lacks enough support"],\n'
        '  "final_revision_advice": "how the final answer should be revised"\n'
        "}\n\n"
        f"Input:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )
