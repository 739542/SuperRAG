from __future__ import annotations

from typing import Any

from app.services.output_validator import safe_parse_json, validate_handover_output


class HandoverPipeline:
    version = "aucmr-handover-pipeline-v1.5"

    def __init__(self, frontend_service: Any):
        self._frontend = frontend_service

    def run(self, *, payload: dict[str, Any], collection: dict[str, Any], query: str) -> dict[str, Any]:
        evidence_context = self._frontend._retrieve_scene_evidence(
            scene="handover",
            collection_id=collection["id"],
            query=query,
            payload=payload,
        )
        fallback = self._frontend._build_handover_fallback(
            query=query,
            payload=payload,
            evidence_context=evidence_context,
        )
        generation = self._frontend._chat_service.generate_json_with_task_prompt(
            task_prompt=self._frontend._build_handover_prompt(payload),
            user_payload={
                "question": query,
                "scene": "handover",
                "requestContext": self._frontend._build_scene_context("handover", payload),
                "retrievalContext": self._frontend._build_model_retrieval_context(evidence_context),
            },
            max_tokens=1800,
            timeout_seconds=self._frontend._scene_model_timeout_seconds(),
        )

        parsed = generation.get("parsed") if isinstance(generation.get("parsed"), dict) else None
        parse_error = ""
        json_repaired = False
        if parsed is None and generation.get("answer"):
            parsed, parse_error = safe_parse_json(generation.get("answer"))
            json_repaired = parsed is not None

        fallback_used = parsed is None
        normalized = self._frontend._normalize_handover_payload(parsed if parsed is not None else fallback, fallback=fallback)
        if not fallback_used and normalized.get("source") == "retrieval-fallback":
            normalized["source"] = "model-json"

        warnings = []
        friendly_warning = self._frontend._friendly_generation_warning(generation, fallback_used=fallback_used)
        if friendly_warning:
            warnings.append(friendly_warning)
        if parse_error and not fallback_used:
            warnings.append(f"模型 JSON 已自动修复：{parse_error}")
        elif parse_error and fallback_used:
            warnings.append(f"模型 JSON 解析失败：{parse_error}")

        if json_repaired and generation.get("warning"):
            generation = {**generation, "warning": "model JSON was repaired and used"}

        structured = validate_handover_output(normalized, fallback=fallback, warnings=warnings)
        if not fallback_used and structured.get("source") == "retrieval-fallback":
            structured["source"] = "model-json"
        summary = self._frontend._summarize_handover_result(structured)
        artifacts = self._frontend._build_handover_artifacts(structured)
        return self._frontend._build_engineering_scene_result(
            scene="handover",
            payload=payload,
            collection=collection,
            evidence_context=evidence_context,
            generation=generation,
            structured=structured,
            summary=summary,
            artifacts=artifacts,
            fallback_used=fallback_used,
            json_repaired=json_repaired,
            validator_warnings=warnings,
            pipeline_version=self.version,
        )
