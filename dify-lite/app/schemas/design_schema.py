from __future__ import annotations

from typing import Any


class DesignOutput:
    """Lightweight schema normalizer for design artifacts.

    The project demo should run without adding backend dependencies, so this
    class intentionally mimics the small subset of Pydantic's API we need.
    """

    list_fields = {
        "businessObjects",
        "businessRules",
        "functionList",
        "useCases",
        "moduleSuggestions",
        "dataObjects",
        "permissionAnalysis",
        "exceptionScenarios",
        "risks",
        "openQuestions",
        "traceabilityMatrix",
        "nextActions",
        "warnings",
    }
    item_text_keys = {
        "businessObjects": "name",
        "businessRules": "rule",
        "functionList": "name",
        "useCases": "name",
        "moduleSuggestions": "name",
        "dataObjects": "name",
        "risks": "description",
        "traceabilityMatrix": "requirementSource",
    }

    defaults: dict[str, Any] = {
        "source": "model-json",
        "businessObjects": [],
        "businessRules": [],
        "functionList": [],
        "useCases": [],
        "moduleSuggestions": [],
        "dataObjects": [],
        "permissionAnalysis": [],
        "exceptionScenarios": [],
        "risks": [],
        "openQuestions": [],
        "traceabilityMatrix": [],
        "evidenceCoverage": {
            "coveredAspects": [],
            "missingAspects": [],
            "coverageLevel": "partial",
            "reviewSuggestion": "",
        },
        "nextActions": [],
        "diagram": "",
        "warnings": [],
        "qualityAssessment": {},
    }

    def __init__(self, data: dict[str, Any]):
        self._data = data

    @classmethod
    def model_validate(cls, data: dict[str, Any] | None) -> "DesignOutput":
        payload = {key: _copy_default(value) for key, value in cls.defaults.items()}
        if isinstance(data, dict):
            payload.update(data)

        for field in cls.list_fields:
            value = payload.get(field)
            if field in cls.item_text_keys:
                payload[field] = _coerce_items(value, cls.item_text_keys[field])
            else:
                payload[field] = _as_list(value)

        coverage = payload.get("evidenceCoverage")
        if not isinstance(coverage, dict):
            coverage = {}
        payload["evidenceCoverage"] = {
            "coveredAspects": _as_list(coverage.get("coveredAspects")),
            "missingAspects": _as_list(coverage.get("missingAspects")),
            "coverageLevel": str(coverage.get("coverageLevel") or "partial"),
            "reviewSuggestion": str(coverage.get("reviewSuggestion") or ""),
            **{key: value for key, value in coverage.items() if key not in {"coveredAspects", "missingAspects", "coverageLevel", "reviewSuggestion"}},
        }
        payload["source"] = str(payload.get("source") or "model-json")
        payload["diagram"] = str(payload.get("diagram") or "")
        if not isinstance(payload.get("qualityAssessment"), dict):
            payload["qualityAssessment"] = {}
        return cls(payload)

    def model_dump(self, mode: str | None = None) -> dict[str, Any]:
        return dict(self._data)


def _copy_default(value: Any) -> Any:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, list):
        return list(value)
    return value


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _coerce_items(value: Any, text_key: str) -> list[Any]:
    result = []
    for item in _as_list(value):
        if isinstance(item, dict):
            result.append(item)
        else:
            result.append({text_key: str(item or "").strip()})
    return result
