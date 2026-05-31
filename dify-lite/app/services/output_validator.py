from __future__ import annotations

import json
import re
from typing import Any

from app.schemas import DesignOutput, HandoverOutput


def safe_parse_json(raw_text: str | None) -> tuple[dict[str, Any] | None, str]:
    """Parse a JSON object even when a model wraps it in prose or code fences."""
    text = str(raw_text or "").strip()
    if not text:
        return None, "empty model answer"

    candidates = _json_candidates(text)
    error = ""
    for candidate in candidates:
        parsed, error = _try_load_json(candidate)
        if isinstance(parsed, dict):
            return parsed, ""
        repaired = _repair_json(candidate)
        if repaired != candidate:
            parsed, error = _try_load_json(repaired)
            if isinstance(parsed, dict):
                return parsed, ""
    return None, error or "no JSON object found"


def validate_design_output(
    data: dict[str, Any] | None,
    *,
    fallback: dict[str, Any] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    merged = _merge_defaults(fallback, data)
    merged["warnings"] = _clean_list([*(warnings or []), *(_as_list(merged.get("warnings")))])
    try:
        output = DesignOutput.model_validate(merged).model_dump(mode="python")
    except Exception as exc:
        fallback_payload = dict(fallback or {})
        fallback_payload["warnings"] = _clean_list([*(warnings or []), f"design schema validation failed: {exc}"])
        output = DesignOutput.model_validate(fallback_payload).model_dump(mode="python")

    if not output.get("evidenceCoverage"):
        output["evidenceCoverage"] = _default_design_coverage(output)
    output["qualityAssessment"] = assess_quality(output, "design")
    return output


def validate_handover_output(
    data: dict[str, Any] | None,
    *,
    fallback: dict[str, Any] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    merged = _merge_defaults(fallback, data)
    merged["warnings"] = _clean_list([*(warnings or []), *(_as_list(merged.get("warnings")))])
    try:
        output = HandoverOutput.model_validate(merged).model_dump(mode="python")
    except Exception as exc:
        fallback_payload = dict(fallback or {})
        fallback_payload["warnings"] = _clean_list([*(warnings or []), f"handover schema validation failed: {exc}"])
        output = HandoverOutput.model_validate(fallback_payload).model_dump(mode="python")

    output["qualityAssessment"] = assess_quality(output, "handover")
    return output


def assess_quality(output: dict[str, Any], schema_type: str) -> dict[str, Any]:
    if schema_type == "design":
        evidence_items = [
            *output.get("functionList", []),
            *output.get("useCases", []),
            *output.get("risks", []),
            *output.get("traceabilityMatrix", []),
        ]
        evidence_bound = sum(1 for item in evidence_items if _has_evidence(item))
        total = len(evidence_items)
        gaps = len(_as_list(output.get("openQuestions")))
        score = _quality_score(evidence_bound, total, gaps)
        return {
            "schema": "design",
            "score": score,
            "evidenceBoundItems": evidence_bound,
            "totalCheckedItems": total,
            "openIssueCount": gaps,
            "level": _quality_level(score),
            "canEnterReview": score >= 0.68 and gaps <= 6,
        }

    evidence_items = [
        *output.get("riskRegister", []),
        *output.get("todoList", []),
        *output.get("evidenceMap", []),
    ]
    evidence_bound = sum(1 for item in evidence_items if _has_evidence(item))
    total = len(evidence_items)
    gaps = len(_as_list(output.get("informationGaps")))
    score = _quality_score(evidence_bound, total, gaps)
    return {
        "schema": "handover",
        "score": score,
        "evidenceBoundItems": evidence_bound,
        "totalCheckedItems": total,
        "informationGapCount": gaps,
        "level": _quality_level(score),
        "canEnterHandoverReview": score >= 0.62,
    }


def _json_candidates(text: str) -> list[str]:
    candidates: list[str] = []
    for match in re.finditer(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.I):
        block = match.group(1).strip()
        if block:
            candidates.append(block)

    start = text.find("{")
    while start >= 0:
        candidate = _balanced_object(text, start)
        if candidate:
            candidates.append(candidate)
            break
        start = text.find("{", start + 1)

    if text not in candidates:
        candidates.append(text)
    return candidates


def _balanced_object(text: str, start: int) -> str:
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return ""


def _try_load_json(text: str) -> tuple[Any, str]:
    try:
        return json.loads(text), ""
    except json.JSONDecodeError as exc:
        return None, str(exc)


def _repair_json(text: str) -> str:
    repaired = text.strip().replace("\ufeff", "")
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
    return repaired


def _merge_defaults(fallback: dict[str, Any] | None, data: dict[str, Any] | None) -> dict[str, Any]:
    merged = dict(fallback or {})
    if isinstance(data, dict):
        for key, value in data.items():
            if value not in (None, "", []):
                merged[key] = value
    return merged


def _default_design_coverage(output: dict[str, Any]) -> dict[str, Any]:
    covered = []
    if output.get("functionList"):
        covered.append("功能清单")
    if output.get("useCases"):
        covered.append("文本用例")
    if output.get("moduleSuggestions"):
        covered.append("模块划分")
    missing = output.get("openQuestions") or []
    return {
        "coveredAspects": covered,
        "missingAspects": missing,
        "coverageLevel": "partial" if covered else "insufficient",
        "reviewSuggestion": "请结合证据覆盖情况人工复核后再进入设计评审。",
    }


def _has_evidence(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    return bool(
        item.get("sourceDocument")
        or item.get("evidenceSnippet")
        or item.get("evidenceSource")
        or item.get("requirementSource")
        or item.get("dependentDocument")
    )


def _quality_score(evidence_bound: int, total: int, gaps: int) -> float:
    if total <= 0:
        return 0.0
    evidence_ratio = evidence_bound / total
    gap_penalty = min(0.35, gaps * 0.035)
    return round(max(0.0, min(1.0, evidence_ratio - gap_penalty)), 2)


def _quality_level(score: float) -> str:
    if score >= 0.78:
        return "strong"
    if score >= 0.52:
        return "usable"
    if score > 0:
        return "weak"
    return "insufficient"


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _clean_list(items: list[Any]) -> list[str]:
    cleaned: list[str] = []
    for item in items:
        text = str(item or "").strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned
