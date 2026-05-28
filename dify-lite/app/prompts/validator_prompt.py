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
        "You are Validator for a software-development RAG assistant.\n"
        "Check whether the answer's key claims are supported by the provided evidence.\n"
        "Unsupported claims must not be treated as established facts.\n"
        "Claims with weak support should be marked uncertain.\n"
        "Return JSON only.\n\n"
        "Output schema:\n"
        '{\n'
        '  "valid_claims": ["claim supported by evidence"],\n'
        '  "unsupported_claims": ["claim without evidence"],\n'
        '  "uncertain_claims": ["claim that needs confirmation"],\n'
        '  "final_revision_advice": "how to revise the answer"\n'
        "}\n\n"
        f"Input:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )
