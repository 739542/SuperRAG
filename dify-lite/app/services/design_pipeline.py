from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from app.services.output_validator import safe_parse_json, validate_design_output


class DesignPipeline:
    version = "aucmr-design-pipeline-v1.6-split"

    def __init__(self, frontend_service: Any):
        self._frontend = frontend_service

    def run(self, *, payload: dict[str, Any], collection: dict[str, Any], query: str) -> dict[str, Any]:
        evidence_context = self._frontend._retrieve_scene_evidence(
            scene="design",
            collection_id=collection["id"],
            query=query,
            payload=payload,
        )
        fallback = self._frontend._build_design_fallback(
            query=query,
            payload=payload,
            evidence_context=evidence_context,
        )
        generation = self._run_split_generation(
            payload=payload,
            query=query,
            evidence_context=evidence_context,
        )

        parsed = generation.get("parsed") if isinstance(generation.get("parsed"), dict) else None
        parse_error = ""
        json_repaired = bool(generation.get("json_repaired"))
        if parsed is None and generation.get("answer"):
            parsed, parse_error = safe_parse_json(generation.get("answer"))
            json_repaired = json_repaired or parsed is not None

        fallback_used = parsed is None
        normalized = self._frontend._normalize_design_payload(parsed if parsed is not None else fallback, fallback=fallback)
        if not fallback_used and normalized.get("source") == "retrieval-fallback":
            normalized["source"] = "model-json"
        normalized = self._frontend._complete_sparse_design_payload(normalized, fallback)
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

        if (
            json_repaired
            and generation.get("warning") == "structured JSON parsing failed; caller may attempt JSON repair"
        ):
            generation = {**generation, "warning": "model JSON was repaired and used"}

        structured = validate_design_output(normalized, fallback=fallback, warnings=warnings)
        if not fallback_used and structured.get("source") == "retrieval-fallback":
            structured["source"] = "model-json"
        summary = self._frontend._summarize_design_result(structured)
        artifacts = self._frontend._build_design_artifacts(structured)
        return self._frontend._build_engineering_scene_result(
            scene="design",
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

    def _run_split_generation(
        self,
        *,
        payload: dict[str, Any],
        query: str,
        evidence_context: dict[str, Any],
    ) -> dict[str, Any]:
        request_context = self._frontend._build_scene_context("design", payload)
        base_payload = {
            "question": query,
            "scene": "design",
            "requestContext": request_context,
        }
        steps = self._design_steps(payload=payload, evidence_context=evidence_context)
        results: list[dict[str, Any]] = []

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(
                    self._run_step,
                    step=step,
                    user_payload={
                        **base_payload,
                        "retrievalContext": self._build_step_retrieval_context(evidence_context, step),
                    },
                ): step
                for step in steps
            }
            for future in as_completed(futures):
                step = futures[future]
                try:
                    results.append(future.result())
                except Exception as exc:
                    results.append(
                        {
                            "name": step["name"],
                            "parsed": None,
                            "answer": "",
                            "warning": f"split step failed unexpectedly: {type(exc).__name__}: {exc}",
                            "json_repaired": False,
                        }
                    )

        ordered_results = sorted(results, key=lambda item: self._step_order(item.get("name", "")))
        successful = [item for item in ordered_results if isinstance(item.get("parsed"), dict)]
        warnings = [
            f"{item.get('name')}: {item.get('warning')}"
            for item in ordered_results
            if item.get("warning")
        ]
        json_repaired = any(bool(item.get("json_repaired")) for item in ordered_results)

        if not successful:
            return {
                "provider": "retrieval-fallback",
                "answer": "",
                "parsed": None,
                "warning": "; ".join(warnings) or "all split design generation steps failed",
                "parts": ordered_results,
                "json_repaired": json_repaired,
            }

        merged = self._merge_step_payloads(successful)
        merged["source"] = "model-split-json"
        return {
            "provider": "openai-compatible",
            "answer": json.dumps(
                {
                    "mode": "split-design-generation",
                    "steps": [
                        {"name": item.get("name"), "output": item.get("parsed")}
                        for item in ordered_results
                        if isinstance(item.get("parsed"), dict)
                    ],
                },
                ensure_ascii=False,
            ),
            "parsed": merged,
            "warning": "; ".join(warnings),
            "parts": ordered_results,
            "json_repaired": json_repaired,
        }

    def _run_step(self, *, step: dict[str, Any], user_payload: dict[str, Any]) -> dict[str, Any]:
        generation = self._frontend._chat_service.generate_json_with_task_prompt(
            task_prompt=step["prompt"],
            user_payload={
                **user_payload,
                "targetOutput": step["target"],
            },
            max_tokens=step["max_tokens"],
            timeout_seconds=step["timeout_seconds"],
        )
        parsed = generation.get("parsed") if isinstance(generation.get("parsed"), dict) else None
        parse_error = ""
        json_repaired = False
        if parsed is None and generation.get("answer"):
            parsed, parse_error = safe_parse_json(generation.get("answer"))
            json_repaired = parsed is not None

        warning = str(generation.get("warning") or "").strip()
        if parse_error and parsed is None:
            warning = "; ".join(item for item in [warning, f"JSON parse failed: {parse_error}"] if item)
        elif json_repaired and warning == "structured JSON parsing failed; caller may attempt JSON repair":
            warning = "model JSON was repaired and used"

        return {
            "name": step["name"],
            "provider": generation.get("provider", "openai-compatible"),
            "answer": generation.get("answer", ""),
            "parsed": parsed,
            "warning": warning,
            "json_repaired": json_repaired,
        }

    def _design_steps(
        self,
        *,
        payload: dict[str, Any],
        evidence_context: dict[str, Any],
    ) -> list[dict[str, Any]]:
        scope = self._frontend._estimate_design_scope(payload=payload, evidence_context=evidence_context)
        step_timeout = min(75.0, self._frontend._scene_model_timeout_seconds())
        common_rules = (
            "You are a software-engineering RAG analyst. Use only retrievalContext evidence. "
            "Do not invent facts that are not supported by evidence. Put unsupported or missing facts into openQuestions. "
            "Return strict JSON only, with no Markdown and no explanation. "
            "Every important item should include sourceDocument and evidenceSnippet when possible. "
            f"Evidence scope estimate: level={scope['level']}, functions≈{scope['functions']}, "
            f"useCases≈{scope['use_cases']}, modules≈{scope['modules']}, rules≈{scope['rules']}, risks≈{scope['risks']}. "
        )
        return [
            {
                "name": "business_analysis",
                "target": [
                    "businessObjects",
                    "businessRules",
                    "functionList",
                    "dataObjects",
                    "permissionAnalysis",
                    "exceptionScenarios",
                    "openQuestions",
                ],
                "max_tokens": 1600,
                "timeout_seconds": step_timeout,
                "prompt": (
                    common_rules
                    + "Task 1: identify business objects, business roles, business rules, evidence-backed function requirements, "
                    "data objects, permission boundaries, and exception scenarios. "
                    "Return fields: source, businessObjects, businessRules, functionList, dataObjects, permissionAnalysis, "
                    "exceptionScenarios, openQuestions. "
                    "functionList items must contain id, name, description, priority, sourceDocument, evidenceSnippet, evidenceScore. "
                    "businessObjects items should contain name, meaning, relatedModules, sourceDocument, evidenceSnippet. "
                    "businessRules items should contain rule, impactScope, sourceDocument, evidenceSnippet, needsReview."
                ),
            },
            {
                "name": "use_cases",
                "target": ["useCases", "openQuestions"],
                "max_tokens": 1100,
                "timeout_seconds": step_timeout,
                "prompt": (
                    common_rules
                    + "Task 2: generate a compact use-case blueprint from evidence-backed operations and rules. "
                    "Do not try to exhaustively write every use case; focus on representative and high-risk operations. "
                    "The system will merge this model blueprint with retrieval-derived use-case candidates for full coverage. "
                    "Return 4 to 8 high-quality use cases at most. "
                    "Return fields: source, useCases, openQuestions. "
                    "useCases items must contain id, name, goal, trigger, actor, preconditions, mainSuccessScenario, "
                    "extensionScenarios, exceptionScenarios, businessRules, dataFields, acceptanceCriteria, postconditions, "
                    "sourceDocument, evidenceSnippet, evidenceScore."
                ),
            },
            {
                "name": "architecture_risks",
                "target": ["moduleSuggestions", "risks", "nextActions", "diagram", "openQuestions"],
                "max_tokens": 1500,
                "timeout_seconds": step_timeout,
                "prompt": (
                    common_rules
                    + "Task 3: propose module boundaries, design risks, follow-up actions, and a Mermaid flowchart. "
                    "Analyze permissions, state transitions, data consistency, amount linkage, deletion constraints, "
                    "cross-module dependencies, and exception flows. "
                    "Return fields: source, moduleSuggestions, risks, nextActions, diagram, openQuestions. "
                    "moduleSuggestions items must contain name, responsibility, input, output, dependencies, sourceDocument. "
                    "risks items must contain description, impact, suggestion, needsReview, sourceDocument, evidenceSnippet."
                ),
            },
            {
                "name": "traceability_quality",
                "target": ["traceabilityMatrix", "evidenceCoverage", "openQuestions"],
                "max_tokens": 1500,
                "timeout_seconds": step_timeout,
                "prompt": (
                    common_rules
                    + "Task 4: build a requirement-function-usecase-module-evidence traceability matrix and evidence coverage check. "
                    "Return fields: source, traceabilityMatrix, evidenceCoverage, openQuestions. "
                    "traceabilityMatrix items must contain requirementSource, functionName, useCaseName, moduleName, "
                    "evidenceSnippet, sourceDocument, evidenceLevel. "
                    "evidenceCoverage must contain coveredAspects, missingAspects, coverageLevel, reviewSuggestion."
                ),
            },
        ]

    def _build_step_retrieval_context(
        self,
        evidence_context: dict[str, Any],
        step: dict[str, Any],
    ) -> dict[str, Any]:
        group_names = {
            "business_analysis": {
                "original",
                "business_objects_roles",
                "functions_flows",
                "rules_states",
                "permissions_owners",
                "exceptions_limits",
            },
            "use_cases": {
                "original",
                "functions_flows",
                "rules_states",
                "exceptions_limits",
                "cross_module_consistency",
            },
            "architecture_risks": {
                "business_objects_roles",
                "permissions_owners",
                "exceptions_limits",
                "cross_module_consistency",
            },
            "traceability_quality": {
                "original",
                "functions_flows",
                "rules_states",
                "cross_module_consistency",
            },
        }.get(str(step.get("name") or ""), set())

        selected_groups: list[dict[str, Any]] = []
        selected_hits: list[dict[str, Any]] = []
        seen: set[str] = set()
        for group in evidence_context.get("groups", []):
            if group_names and group.get("name") not in group_names:
                continue
            compact_hits = [
                self._frontend._compact_model_hit(hit)
                for hit in self._frontend._as_list(group.get("hits"))[:2]
            ]
            if not compact_hits:
                continue
            selected_groups.append(
                {
                    "name": group.get("name", ""),
                    "query": group.get("query", ""),
                    "hits": compact_hits,
                }
            )
            for hit in compact_hits:
                identity = f"{hit.get('sourceDocument')}::{str(hit.get('snippet') or '')[:80]}"
                if identity in seen:
                    continue
                seen.add(identity)
                selected_hits.append(hit)

        if not selected_hits:
            selected_hits = [
                self._frontend._compact_model_hit(hit)
                for hit in evidence_context.get("hits", [])[:6]
            ]

        return {
            "queries": [
                item
                for item in evidence_context.get("queries", [])
                if not group_names or item.get("name") in group_names
            ],
            "groups": selected_groups[:5],
            "hits": selected_hits[:8],
        }

    def _merge_step_payloads(self, step_results: list[dict[str, Any]]) -> dict[str, Any]:
        merged: dict[str, Any] = {"source": "model-split-json"}
        list_identity = {
            "businessObjects": "name",
            "businessRules": "rule",
            "functionList": "name",
            "useCases": "name",
            "moduleSuggestions": "name",
            "dataObjects": "name",
            "permissionAnalysis": "role",
            "exceptionScenarios": "scenario",
            "risks": "description",
            "openQuestions": "question",
            "traceabilityMatrix": "functionName",
            "nextActions": "action",
        }
        for item in sorted(step_results, key=lambda value: self._step_order(value.get("name", ""))):
            parsed = item.get("parsed")
            if not isinstance(parsed, dict):
                continue
            for key, value in parsed.items():
                if value in (None, "", []):
                    continue
                if key in list_identity:
                    merged[key] = self._frontend._merge_structured_items(
                        self._frontend._as_list(merged.get(key)),
                        self._frontend._as_list(value),
                        list_identity[key],
                    )
                elif key == "evidenceCoverage" and isinstance(value, dict):
                    merged[key] = self._merge_evidence_coverage(merged.get(key), value)
                elif key == "diagram" and value and not merged.get("diagram"):
                    merged[key] = value
                elif key != "source":
                    merged[key] = value
        return merged

    def _merge_evidence_coverage(self, current: Any, incoming: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(current, dict):
            current = {}
        return {
            **current,
            **incoming,
            "coveredAspects": self._frontend._merge_structured_items(
                self._frontend._as_list(current.get("coveredAspects")),
                self._frontend._as_list(incoming.get("coveredAspects")),
                "",
            ),
            "missingAspects": self._frontend._merge_structured_items(
                self._frontend._as_list(current.get("missingAspects")),
                self._frontend._as_list(incoming.get("missingAspects")),
                "",
            ),
        }

    def _step_order(self, name: str) -> int:
        order = {
            "business_analysis": 0,
            "use_cases": 1,
            "architecture_risks": 2,
            "traceability_quality": 3,
        }
        return order.get(name, 99)
