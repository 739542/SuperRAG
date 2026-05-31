from __future__ import annotations

from typing import Any


class HandoverOutput:
    """Lightweight schema normalizer for handover artifacts."""

    list_fields = {
        "completedItems",
        "unfinishedItems",
        "riskRegister",
        "todoList",
        "responsibilityBoundary",
        "dependentDocuments",
        "informationGaps",
        "handoverChecklist",
        "evidenceMap",
        "warnings",
    }
    item_text_keys = {
        "riskRegister": "risk",
        "todoList": "taskName",
        "responsibilityBoundary": "role",
        "evidenceMap": "conclusion",
    }
    defaults: dict[str, Any] = {
        "source": "model-json",
        "projectBackground": "",
        "currentProgress": "",
        "completedItems": [],
        "unfinishedItems": [],
        "riskRegister": [],
        "todoList": [],
        "responsibilityBoundary": [],
        "dependentDocuments": [],
        "informationGaps": [],
        "handoverChecklist": [],
        "evidenceMap": [],
        "warnings": [],
        "qualityAssessment": {},
    }

    def __init__(self, data: dict[str, Any]):
        self._data = data

    @classmethod
    def model_validate(cls, data: dict[str, Any] | None) -> "HandoverOutput":
        payload = {key: _copy_default(value) for key, value in cls.defaults.items()}
        if isinstance(data, dict):
            payload.update(data)

        for field in cls.list_fields:
            value = payload.get(field)
            if field in cls.item_text_keys:
                payload[field] = _coerce_items(value, cls.item_text_keys[field])
            else:
                payload[field] = _as_list(value)

        payload["source"] = str(payload.get("source") or "model-json")
        payload["projectBackground"] = str(payload.get("projectBackground") or "")
        payload["currentProgress"] = str(payload.get("currentProgress") or "")
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
