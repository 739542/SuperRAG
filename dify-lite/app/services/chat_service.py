from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.config import Settings
from app.prompts import (
    build_answer_generator_prompt,
    build_evidence_collector_prompt,
    build_query_designer_prompt,
    build_validator_prompt,
)
from app.services.retrieval_service import RetrievalService


class ChatService:
    PIPELINE_VERSION = "aucmr-dcrrm-lite-v1"
    PIPELINE_STEPS = [
        "query_designer",
        "retriever",
        "evidence_collector",
        "answer_generator",
        "validator",
    ]

    def __init__(self, settings: Settings, retrieval_service: RetrievalService):
        self._settings = settings
        self._retrieval_service = retrieval_service

    def answer(
        self,
        *,
        collection_id: str,
        query: str,
        top_k: int = 5,
        history: list[dict[str, str]] | None = None,
        model_name: str | None = None,
        system_prompt: str | None = None,
        scene: str = "general",
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        designed_queries = self._design_queries(
            query=query,
            history=history,
            scene=scene,
            context=context,
            model_name=model_name,
        )
        retrieval = self._retrieval_service.retrieve_many(
            collection_id=collection_id,
            queries=designed_queries["queries"],
            top_k=max(top_k, self._settings.max_context_chunks),
        )
        evidence_bundle = self._collect_evidence(
            query=query,
            queries=designed_queries["queries"],
            hits=retrieval["hits"][: self._settings.max_context_chunks],
            scene=scene,
            model_name=model_name,
        )
        answer_bundle = self._generate_answer(
            query=query,
            evidence_bundle=evidence_bundle,
            history=history,
            scene=scene,
            scene_guidance=system_prompt or "",
            model_name=model_name,
        )
        validation = self._validate_answer(
            query=query,
            answer_bundle=answer_bundle,
            evidence_bundle=evidence_bundle,
            scene=scene,
            model_name=model_name,
        )
        final_payload = self._build_final_answer(
            query=query,
            answer_bundle=answer_bundle,
            evidence_bundle=evidence_bundle,
            validation=validation,
            retrieval=retrieval,
            designed_queries=designed_queries,
            model_name=model_name,
        )
        final_payload["pipeline"] = self._build_pipeline_trace(
            designed_queries=designed_queries,
            retrieval=retrieval,
            evidence_bundle=evidence_bundle,
            answer_bundle=answer_bundle,
            validation=validation,
        )
        final_payload["scene"] = scene
        return final_payload

    def answer_with_task_prompt(
        self,
        *,
        collection_id: str,
        query: str,
        task_prompt: str,
        top_k: int = 5,
        history: list[dict[str, str]] | None = None,
        model_name: str | None = None,
        scene: str = "general",
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        designed_queries = self._design_queries(
            query=query,
            history=history,
            scene=scene,
            context=context,
            model_name=model_name,
        )
        retrieval = self._retrieval_service.retrieve_many(
            collection_id=collection_id,
            queries=designed_queries["queries"],
            top_k=max(top_k, self._settings.max_context_chunks),
        )
        evidence_bundle = self._collect_evidence(
            query=query,
            queries=designed_queries["queries"],
            hits=retrieval["hits"][: self._settings.max_context_chunks],
            scene=scene,
            model_name=model_name,
        )

        if self._llm_available():
            answer = self._call_openai_compatible(
                [
                    {
                        "role": "system",
                        "content": (
                            "You are a grounded software-development RAG assistant. "
                            "Use only the provided evidence bundle and do not invent missing project facts.\n\n"
                            f"{task_prompt}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "question": query,
                                "scene": scene,
                                "evidence_bundle": evidence_bundle,
                                "history": [
                                    {
                                        "role": item.get("role", ""),
                                        "content": item.get("content", "")[:300],
                                    }
                                    for item in (history or [])[-6:]
                                    if item.get("content")
                                ],
                            },
                            ensure_ascii=False,
                            indent=2,
                        ),
                    },
                ],
                model_name or self._settings.model_name,
                temperature=0.15,
            )
            provider = "openai-compatible"
        else:
            answer = self._mock_task_answer(query=query, evidence_bundle=evidence_bundle)
            provider = "mock"

        citations = self._build_citations(retrieval["hits"])
        evidence_level = self._infer_evidence_level(citations, evidence_bundle.get("missing_information", []))
        answer_bundle = {
            "answer": answer,
            "implementation_suggestions": [],
            "evidence_mapping": [],
            "uncertain_points": evidence_bundle.get("missing_information", []),
            "key_claims": [f"Task output for scene '{scene}' was generated from retrieved evidence."],
        }
        validation = self._validate_answer(
            query=query,
            answer_bundle=answer_bundle,
            evidence_bundle=evidence_bundle,
            scene=scene,
            model_name=model_name,
        )
        pipeline = self._build_pipeline_trace(
            designed_queries=designed_queries,
            retrieval=retrieval,
            evidence_bundle=evidence_bundle,
            answer_bundle=answer_bundle,
            validation=validation,
        )
        return {
            "pipeline_version": self.PIPELINE_VERSION,
            "pipeline_steps": self.PIPELINE_STEPS,
            "scene": scene,
            "query": query,
            "answer": answer,
            "provider": provider,
            "model": model_name or self._settings.model_name or "mock-rag-summary",
            "retrieval": retrieval,
            "retriever": retrieval,
            "query_designer": designed_queries,
            "evidence_collector": evidence_bundle,
            "answer_generator": answer_bundle,
            "validator": validation,
            "pipeline": pipeline,
            "citations": citations,
            "evidenceLevel": evidence_level,
            "missing_information": evidence_bundle.get("missing_information", []),
            "warning": retrieval.get("warning", ""),
        }

    def generate_json_with_task_prompt(
        self,
        *,
        task_prompt: str,
        user_payload: dict[str, Any],
        model_name: str | None = None,
        temperature: float = 0.12,
        max_tokens: int | None = None,
        timeout_seconds: float | None = None,
    ) -> dict[str, Any]:
        if not self._llm_available():
            return {
                "provider": "retrieval-fallback",
                "answer": "",
                "parsed": None,
                "warning": "model is not configured; retrieval fallback was used",
            }

        try:
            answer = self._call_openai_compatible(
                [
                    {
                        "role": "system",
                        "content": (
                            "You are a grounded software-engineering RAG analyst. "
                            "Use only the provided retrieval evidence. "
                            "Return strict JSON only.\n\n"
                            f"{task_prompt}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(user_payload, ensure_ascii=False, indent=2),
                    },
                ],
                model_name or self._settings.model_name,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
            )
        except Exception as exc:
            return {
                "provider": "openai-compatible",
                "answer": "",
                "parsed": None,
                "warning": f"model generation failed: {type(exc).__name__}: {exc}",
            }

        parsed = self._parse_json_object(answer)
        if isinstance(parsed, dict):
            return {
                "provider": "openai-compatible",
                "answer": answer,
                "parsed": parsed,
                "warning": "",
            }
        return {
            "provider": "openai-compatible",
            "answer": answer,
            "parsed": None,
            "warning": "structured JSON parsing failed; caller may attempt JSON repair",
        }

    def _design_queries(
        self,
        *,
        query: str,
        history: list[dict[str, str]] | None,
        scene: str,
        context: dict[str, Any] | None,
        model_name: str | None,
    ) -> dict[str, Any]:
        fallback = {"queries": [query], "reason": "Use the original question directly."}
        if not self._llm_available():
            return fallback

        prompt = build_query_designer_prompt(
            question=query,
            history=history,
            scene=scene,
            context=context,
        )
        payload = self._call_json_prompt(prompt=prompt, model_name=model_name, fallback=fallback)
        queries = [item.strip() for item in payload.get("queries", []) if isinstance(item, str) and item.strip()]
        if query not in queries:
            queries.insert(0, query)
        queries = self._merge_heuristic_queries(
            query=query,
            scene=scene,
            queries=queries,
            context=context,
        )
        return {
            "queries": queries[:4] or [query],
            "reason": str(payload.get("reason") or fallback["reason"]).strip() or fallback["reason"],
        }

    def _merge_heuristic_queries(
        self,
        *,
        query: str,
        scene: str,
        queries: list[str],
        context: dict[str, Any] | None,
    ) -> list[str]:
        merged: list[str] = []
        seen: set[str] = set()
        for item in queries + self._heuristic_scene_queries(query=query, scene=scene, context=context):
            normalized = str(item or "").strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            merged.append(normalized)
        return merged[:4]

    def _heuristic_scene_queries(
        self,
        *,
        query: str,
        scene: str,
        context: dict[str, Any] | None,
    ) -> list[str]:
        if scene != "general":
            return []

        project = str((context or {}).get("project") or "").strip()
        prefix = f"{project} " if project else ""
        lowered = query.lower()
        queries: list[str] = []
        if self._is_rule_or_permission_question(query):
            if re.search(r"金额|开票金额|合同金额", query) and re.search(r"编辑|修改|权限|条件", query):
                queries.append(f"{prefix}合同金额 开票金额 编辑 权限 条件 规则")
                queries.append(f"{prefix}合同 发票 金额 超过 合同金额 校验 同步")
            if re.search(r"负责人|团队成员|权限|可见范围|协作|公海", query):
                queries.append(f"{prefix}负责人 团队成员 权限 划分 可见范围 协作")
                queries.append(f"{prefix}客户 商机 合同 团队成员 负责人 转移 公海 权限")
            if re.search(r"关系|联动|上下游|约束", query):
                queries.append(f"{prefix}合同 回款 发票 商机 客户 联动 约束")
        if "crm" in lowered and not queries:
            queries.append(f"{prefix}CRM 权限 规则 流程")
        return queries

    def _collect_evidence(
        self,
        *,
        query: str,
        queries: list[str],
        hits: list[dict[str, Any]],
        scene: str,
        model_name: str | None,
    ) -> dict[str, Any]:
        fallback = self._fallback_evidence_bundle(query=query, hits=hits)
        if not hits or not self._llm_available():
            return fallback

        prompt = build_evidence_collector_prompt(
            question=query,
            queries=queries,
            retrieved_chunks=[self._serialize_hit_for_prompt(hit) for hit in hits],
            scene=scene,
        )
        payload = self._call_json_prompt(prompt=prompt, model_name=model_name, fallback=fallback)
        evidence = []
        for item in payload.get("evidence", []):
            if not isinstance(item, dict):
                continue
            content = str(item.get("content") or "").strip()
            if not content:
                continue
            evidence.append(
                {
                    "source": str(item.get("source") or "Knowledge Base").strip() or "Knowledge Base",
                    "section": str(item.get("section") or "chunk").strip() or "chunk",
                    "content": content,
                    "relevance": str(item.get("relevance") or "").strip(),
                }
            )
        if not evidence:
            evidence = fallback["evidence"]
        missing_information = [
            str(item).strip()
            for item in payload.get("missing_information", [])
            if str(item).strip()
        ] or fallback["missing_information"]
        return {
            "evidence": evidence[: self._settings.max_context_chunks],
            "missing_information": missing_information[:4],
        }

    def _generate_answer(
        self,
        *,
        query: str,
        evidence_bundle: dict[str, Any],
        history: list[dict[str, str]] | None,
        scene: str,
        scene_guidance: str,
        model_name: str | None,
    ) -> dict[str, Any]:
        fallback = self._mock_structured_answer(query=query, evidence_bundle=evidence_bundle)
        if not self._llm_available():
            return fallback

        prompt = build_answer_generator_prompt(
            question=query,
            evidence_bundle=evidence_bundle,
            history=history,
            scene=scene,
            scene_guidance=scene_guidance,
        )
        payload = self._call_json_prompt(prompt=prompt, model_name=model_name, fallback=fallback)
        answer = str(payload.get("answer") or "").strip() or fallback["answer"]
        suggestions = [
            str(item).strip()
            for item in payload.get("implementation_suggestions", [])
            if str(item).strip()
        ] or fallback["implementation_suggestions"]
        evidence_mapping = []
        for item in payload.get("evidence_mapping", []):
            if not isinstance(item, dict):
                continue
            claim = str(item.get("claim") or "").strip()
            evidence = item.get("evidence") or []
            if not claim:
                continue
            evidence_mapping.append(
                {
                    "claim": claim,
                    "evidence": [str(value).strip() for value in evidence if str(value).strip()],
                }
            )
        uncertain_points = [
            str(item).strip()
            for item in payload.get("uncertain_points", [])
            if str(item).strip()
        ] or fallback["uncertain_points"]
        key_claims = [
            str(item).strip()
            for item in payload.get("key_claims", [])
            if str(item).strip()
        ]
        if not key_claims:
            key_claims = [item["claim"] for item in evidence_mapping] or [answer]
        return {
            "answer": answer,
            "implementation_suggestions": suggestions[:5],
            "evidence_mapping": evidence_mapping[:6],
            "uncertain_points": uncertain_points[:5],
            "key_claims": key_claims[:6],
        }

    def _validate_answer(
        self,
        *,
        query: str,
        answer_bundle: dict[str, Any],
        evidence_bundle: dict[str, Any],
        scene: str,
        model_name: str | None,
    ) -> dict[str, Any]:
        fallback = self._fallback_validation(answer_bundle=answer_bundle, evidence_bundle=evidence_bundle)
        if not self._llm_available():
            return fallback

        prompt = build_validator_prompt(
            question=query,
            answer_bundle=answer_bundle,
            evidence_bundle=evidence_bundle,
            scene=scene,
        )
        payload = self._call_json_prompt(prompt=prompt, model_name=model_name, fallback=fallback)
        return {
            "valid_claims": [str(item).strip() for item in payload.get("valid_claims", []) if str(item).strip()],
            "unsupported_claims": [
                str(item).strip()
                for item in payload.get("unsupported_claims", [])
                if str(item).strip()
            ],
            "uncertain_claims": [str(item).strip() for item in payload.get("uncertain_claims", []) if str(item).strip()],
            "final_revision_advice": str(payload.get("final_revision_advice") or "").strip()
            or fallback["final_revision_advice"],
        }

    def _build_final_answer(
        self,
        *,
        query: str,
        answer_bundle: dict[str, Any],
        evidence_bundle: dict[str, Any],
        validation: dict[str, Any],
        retrieval: dict[str, Any],
        designed_queries: dict[str, Any],
        model_name: str | None,
    ) -> dict[str, Any]:
        citations = self._build_citations(retrieval["hits"])
        structured_answer = self._build_structured_answer(answer_bundle, evidence_bundle, validation)
        unsupported_claims = validation.get("unsupported_claims", [])
        uncertain_points = list(answer_bundle.get("uncertain_points", []))
        if unsupported_claims:
            uncertain_points.append(
                "The following conclusions are not fully supported by retrieved evidence: "
                + "; ".join(unsupported_claims[:3])
            )
        missing_information = list(evidence_bundle.get("missing_information", []))
        evidence_level = self._infer_evidence_level(citations, missing_information + validation.get("unsupported_claims", []))
        provider = "openai-compatible" if self._llm_available() else "mock"
        return {
            "pipeline_version": self.PIPELINE_VERSION,
            "pipeline_steps": self.PIPELINE_STEPS,
            "query": query,
            "answer": answer_bundle["answer"],
            "provider": provider,
            "model": model_name or self._settings.model_name or "mock-rag-summary",
            "structured_answer": structured_answer,
            "implementation_suggestions": answer_bundle.get("implementation_suggestions", []),
            "evidence_mapping": answer_bundle.get("evidence_mapping", []),
            "uncertain_points": uncertain_points,
            "missing_information": missing_information,
            "query_designer": designed_queries,
            "retriever": retrieval,
            "evidence_collector": evidence_bundle,
            "answer_generator": answer_bundle,
            "validator": validation,
            "citations": citations,
            "evidenceLevel": evidence_level,
            "retrieval": retrieval,
            "warning": retrieval.get("warning", ""),
        }

    def _build_structured_answer(
        self,
        answer_bundle: dict[str, Any],
        evidence_bundle: dict[str, Any],
        validation: dict[str, Any],
    ) -> dict[str, str]:
        evidence_lines = []
        for item in evidence_bundle.get("evidence", [])[:4]:
            evidence_lines.append(f"{item['source']}#{item['section']}: {item['content']}")
        uncertainty = list(answer_bundle.get("uncertain_points", []))
        if validation.get("unsupported_claims"):
            uncertainty.append("缺少证据支撑的结论：" + "；".join(validation["unsupported_claims"][:3]))
        if evidence_bundle.get("missing_information"):
            uncertainty.extend(evidence_bundle["missing_information"][:2])
        return {
            "conclusion": answer_bundle.get("answer", ""),
            "evidence": "\n".join(evidence_lines) if evidence_lines else "当前没有抽取到可引用证据。",
            "suggestion": "\n".join(answer_bundle.get("implementation_suggestions", []))
            or "请先核对引用文档，再将回答作为正式结论。",
            "uncertainty": "\n".join(uncertainty) if uncertainty else "当前没有识别到明显的不确定项。",
        }

    def _build_pipeline_trace(
        self,
        *,
        designed_queries: dict[str, Any],
        retrieval: dict[str, Any],
        evidence_bundle: dict[str, Any],
        answer_bundle: dict[str, Any],
        validation: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "version": self.PIPELINE_VERSION,
            "steps": [
                {
                    "name": "query_designer",
                    "status": "completed",
                    "output": designed_queries,
                },
                {
                    "name": "retriever",
                    "status": "completed",
                    "output": {
                        "queries": retrieval.get("queries") or [retrieval.get("query", "")],
                        "hit_count": len(retrieval.get("hits", [])),
                        "warning": retrieval.get("warning", ""),
                    },
                },
                {
                    "name": "evidence_collector",
                    "status": "completed",
                    "output": evidence_bundle,
                },
                {
                    "name": "answer_generator",
                    "status": "completed",
                    "output": answer_bundle,
                },
                {
                    "name": "validator",
                    "status": "completed",
                    "output": validation,
                },
            ],
        }

    def _fallback_evidence_bundle(self, *, query: str, hits: list[dict[str, Any]]) -> dict[str, Any]:
        if not hits:
            return {
                "evidence": [],
                "missing_information": [f"当前知识库没有检索到可支撑该问题的证据：{query}"],
            }

        evidence = []
        for hit in hits[: self._settings.max_context_chunks]:
            source_name = hit.get("metadata", {}).get("source_name") or "Knowledge Base"
            position = int(hit.get("position", 0) or 0) + 1
            section = f"chunk-{position}"
            content = hit.get("content", "").strip().replace("\n", " ")
            matched_queries = ", ".join(hit.get("matched_queries", [])[:2]) or query
            evidence.append(
                {
                    "source": source_name,
                    "section": section,
                    "content": content[:280],
                    "relevance": f"Retrieved for query: {matched_queries}",
                }
            )

        missing_information: list[str] = []
        top_score = float(hits[0].get("score") or 0)
        if top_score < 0.2:
            missing_information.append("检索片段相关度较低，关键细节可能仍然缺失。")
        if len(hits) < 2:
            missing_information.append("当前只找到少量支撑证据，建议补充更多项目文档。")
        return {
            "evidence": evidence,
            "missing_information": missing_information,
        }

    def _mock_structured_answer(self, *, query: str, evidence_bundle: dict[str, Any]) -> dict[str, Any]:
        evidence = evidence_bundle.get("evidence", [])
        if not evidence:
            return {
                "answer": "当前知识库没有检索到足够证据，无法形成正式结论。",
                "implementation_suggestions": [
                    "请先补充相关需求、设计、接口、交接或培训文档后再重新提问。"
                ],
                "evidence_mapping": [],
                "uncertain_points": evidence_bundle.get("missing_information", []) or ["当前问题缺少可用证据。"],
                "key_claims": ["当前问题缺少知识库证据，不能作为正式结论。"],
            }

        answer, key_claims, evidence_mapping = self._build_question_focused_fallback_answer(
            query=query,
            evidence=evidence,
        )
        return {
            "answer": answer,
            "implementation_suggestions": [
                "优先核对引用文档原文，再将回答作为正式结论。",
                "未绑定证据的实现想法只能作为待复核建议。",
            ],
            "evidence_mapping": evidence_mapping,
            "uncertain_points": evidence_bundle.get("missing_information", []),
            "key_claims": key_claims,
        }

    def _build_question_focused_fallback_answer(
        self,
        *,
        query: str,
        evidence: list[dict[str, Any]],
    ) -> tuple[str, list[str], list[dict[str, Any]]]:
        if self._is_rule_or_permission_question(query) and not self._is_content_inventory_question(query):
            specialized = self._build_rule_or_permission_fallback_answer(query=query, evidence=evidence)
            if specialized:
                return specialized

        grouped = self._group_evidence_by_source(evidence)
        primary_source, primary_items = grouped[0]
        primary_topic = self._source_topic(primary_source)
        aspects = self._extract_evidence_aspects(primary_items)
        supporting_topics = []
        for source, _items in grouped[1:4]:
            topic = self._source_topic(source)
            if topic and topic != primary_topic and topic not in supporting_topics:
                supporting_topics.append(topic)

        evidence_refs = [f"{item['source']}#{item['section']}" for item in primary_items[:2]]
        fallback_ref = [f"{primary_source}#{primary_items[0]['section']}"] if primary_items else [primary_source]

        if self._is_content_inventory_question(query):
            if aspects:
                lines = [f"围绕《{primary_source}》，当前命中的文档内容主要包括："]
                lines.extend(f"{index + 1}. {aspect}" for index, aspect in enumerate(aspects))
                key_claims = aspects[:]
            else:
                snippet_summary = self._build_primary_snippet_summary(primary_items)
                lines = [f"围绕《{primary_source}》，当前命中的片段主要说明了：{snippet_summary}"]
                key_claims = [f"{primary_topic}的主要内容基于《{primary_source}》整理。"]

            if supporting_topics:
                lines.append("其他命中文档主要用于补充与该主题相关的上下游关系：" + "、".join(supporting_topics) + "。")

            evidence_mapping = [
                {
                    "claim": claim,
                    "evidence": evidence_refs or fallback_ref,
                }
                for claim in key_claims[:4]
            ]
            return "\n".join(lines), key_claims[:5], evidence_mapping

        snippet_summary = self._build_primary_snippet_summary(primary_items)
        lines = [f"针对“{query}”，当前命中的文档表明：{snippet_summary}"]
        if aspects:
            lines.append("这些证据主要围绕：" + "、".join(aspects[:4]) + "。")
        if supporting_topics:
            lines.append("同时，" + "、".join(supporting_topics) + " 等文档可用于补充相关的上下游流程或约束信息。")

        key_claims = aspects[:4] or [snippet_summary]
        evidence_mapping = [
            {
                "claim": claim,
                "evidence": evidence_refs or fallback_ref,
            }
            for claim in key_claims[:4]
        ]
        return "\n".join(lines), key_claims[:5], evidence_mapping

    def _build_rule_or_permission_fallback_answer(
        self,
        *,
        query: str,
        evidence: list[dict[str, Any]],
    ) -> tuple[str, list[str], list[dict[str, Any]]] | None:
        theme_sections = self._collect_rule_or_permission_sections(query=query, evidence=evidence)
        if not theme_sections:
            return None

        lines = [f"围绕“{query}”，当前命中的文档可支撑以下几点："]
        key_claims: list[str] = []
        evidence_mapping: list[dict[str, Any]] = []
        for index, section in enumerate(theme_sections, start=1):
            lines.append(f"{index}. {section['title']}：{section['summary']}")
            key_claims.append(section["claim"])
            evidence_mapping.append(
                {
                    "claim": section["claim"],
                    "evidence": section["evidence"],
                }
            )

        missing_sections = [
            title
            for title in [
                "金额字段在什么条件下可编辑",
                "负责人 / 团队成员权限如何划分",
                "涉及哪些模块联动与约束",
            ]
            if title not in {section["title"] for section in theme_sections}
        ]
        if missing_sections:
            lines.append("当前证据暂未完整覆盖：" + "、".join(missing_sections) + "。")

        return "\n".join(lines), key_claims[:5], evidence_mapping[:5]

    def _collect_rule_or_permission_sections(
        self,
        *,
        query: str,
        evidence: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        themes = [
            (
                "金额字段在什么条件下可编辑",
                [r"金额", r"合同金额", r"开票金额", r"编辑", r"修改", r"默认", r"同步", r"超过", r"校验"],
            ),
            (
                "负责人 / 团队成员权限如何划分",
                [r"负责人", r"团队成员", r"权限", r"可见", r"转移", r"协作", r"公海"],
            ),
            (
                "涉及哪些模块联动与约束",
                [r"合同", r"发票", r"回款", r"商机", r"客户", r"联动", r"同步", r"上游", r"下游"],
            ),
        ]
        sections: list[dict[str, Any]] = []
        for title, markers in themes:
            matched = [
                item
                for item in evidence
                if any(re.search(marker, str(item.get("content") or "")) for marker in markers)
            ]
            if not matched:
                continue
            summary = self._summarize_rule_or_permission_items(matched)
            if not summary:
                continue
            evidence_refs = [f"{item['source']}#{item['section']}" for item in matched[:2]]
            sections.append(
                {
                    "title": title,
                    "summary": summary,
                    "claim": f"{title}：{summary}",
                    "evidence": evidence_refs,
                }
            )
        return sections

    def _summarize_rule_or_permission_items(self, items: list[dict[str, Any]]) -> str:
        snippets: list[str] = []
        for item in items[:3]:
            cleaned = self._clean_fallback_text(str(item.get("content") or ""))
            for sentence in re.split(r"(?<=[。！？；])\s+|(?<=\.)\s+", cleaned):
                sentence = sentence.strip(" -:：;；，,")
                if len(sentence) < 14:
                    continue
                if sentence not in snippets:
                    snippets.append(sentence)
                if len(snippets) >= 2:
                    return "；".join(snippets)
        return "；".join(snippets[:2])

    def _group_evidence_by_source(self, evidence: list[dict[str, Any]]) -> list[tuple[str, list[dict[str, Any]]]]:
        groups: dict[str, list[dict[str, Any]]] = {}
        order: list[str] = []
        for item in evidence:
            source = str(item.get("source") or "Knowledge Base").strip() or "Knowledge Base"
            if source not in groups:
                groups[source] = []
                order.append(source)
            groups[source].append(item)
        return [(source, groups[source]) for source in order] or [("Knowledge Base", evidence)]

    def _is_content_inventory_question(self, query: str) -> bool:
        return bool(re.search(r"包含|哪些内容|都包含了|主要内容|文档内容|介绍|说明", query))

    def _is_rule_or_permission_question(self, query: str) -> bool:
        return bool(re.search(r"权限|负责人|团队成员|编辑|修改|规则|条件|可见|约束|联动|划分", query))

    def _extract_evidence_aspects(self, items: list[dict[str, Any]]) -> list[str]:
        text = " ".join(str(item.get("content") or "") for item in items)
        patterns = [
            ("模块定位与业务作用", [r"模块定位", r"用于处理", r"用于记录", r"用于管理"]),
            ("核心业务对象与关联数据", [r"核心业务对象", r"发票申请", r"客户", r"合同", r"回款", r"商机"]),
            ("主要功能操作与处理环节", [r"新建", r"创建", r"编辑", r"提交", r"审核", r"作废", r"查看", r"记录"]),
            ("上下游流程联动与状态流转", [r"联动", r"同步", r"流程", r"状态", r"进度"]),
            ("关键业务规则与校验约束", [r"规则", r"唯一", r"必填", r"不得", r"超过", r"校验", r"阻止"]),
        ]
        aspects: list[str] = []
        for label, markers in patterns:
            if any(re.search(marker, text) for marker in markers):
                aspects.append(label)
        return aspects[:5]

    def _build_primary_snippet_summary(self, items: list[dict[str, Any]]) -> str:
        sentences: list[str] = []
        for item in items[:3]:
            cleaned = self._clean_fallback_text(str(item.get("content") or ""))
            for sentence in re.split(r"(?<=[。！？；])\s+|(?<=\.)\s+", cleaned):
                sentence = sentence.strip(" -:：;；，,")
                if len(sentence) < 12:
                    continue
                if sentence not in sentences:
                    sentences.append(sentence)
                if len(sentences) >= 2:
                    return "；".join(sentences)
        return "；".join(sentences[:2]) if sentences else "当前命中的片段主要是该主题的相关业务说明和规则摘要。"

    def _clean_fallback_text(self, text: str) -> str:
        cleaned = re.sub(r"https?://\S+", "", text)
        cleaned = re.sub(r"[>#*_`]+", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned.strip()

    def _source_topic(self, source: str) -> str:
        topic = re.sub(r"\.[a-z0-9]+$", "", source, flags=re.IGNORECASE)
        topic = re.sub(r"^\d+[_-]*", "", topic)
        topic = re.sub(r"CRM|SuperRAG|演示整理版", "", topic, flags=re.IGNORECASE)
        topic = re.sub(r"模块说明|说明|文档", "", topic)
        topic = re.sub(r"[_\-\s]+", "", topic)
        return topic.strip() or source

    def _mock_task_answer(self, *, query: str, evidence_bundle: dict[str, Any]) -> str:
        evidence = evidence_bundle.get("evidence", [])
        if not evidence:
            return (
                "当前知识库没有检索到足够项目证据，因此不能可靠生成场景化回答。\n\n"
                f"用户问题：{query}"
            )
        lines = [f"- {item['source']}#{item['section']}: {item['content']}" for item in evidence[:4]]
        return "当前任务检索到以下证据，请结合原文复核：\n" + "\n".join(lines)

    def _fallback_validation(self, *, answer_bundle: dict[str, Any], evidence_bundle: dict[str, Any]) -> dict[str, Any]:
        valid_claims = []
        unsupported_claims = []
        for item in answer_bundle.get("evidence_mapping", []):
            claim = item.get("claim", "")
            evidence = item.get("evidence") or []
            if claim and evidence:
                valid_claims.append(claim)
            elif claim:
                unsupported_claims.append(claim)
        uncertain_claims = list(answer_bundle.get("uncertain_points", []))
        if not evidence_bundle.get("evidence"):
            unsupported_claims.append("当前问题无法从已有知识库证据中得到可靠回答。")
        return {
            "valid_claims": valid_claims,
            "unsupported_claims": unsupported_claims,
            "uncertain_claims": uncertain_claims,
            "final_revision_advice": "只保留有证据支撑的结论作为事实，其余内容应进入不确定性说明。",
        }

    def _serialize_hit_for_prompt(self, hit: dict[str, Any]) -> dict[str, Any]:
        metadata = hit.get("metadata", {})
        return {
            "chunk_id": hit.get("id", ""),
            "document_id": hit.get("document_id", ""),
            "source_name": metadata.get("source_name") or "",
            "position": hit.get("position", 0),
            "score": hit.get("score", 0),
            "matched_queries": hit.get("matched_queries", []),
            "content": hit.get("content", ""),
        }

    def _build_citations(self, hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
        citations = []
        for item in hits[: self._settings.max_context_chunks]:
            metadata = item.get("metadata", {})
            source = metadata.get("source_name") or "Knowledge Base Segment"
            snippet = item.get("content", "").strip().replace("\n", " ")
            score = float(item.get("score") or 0)
            position = int(item.get("position", 0) or 0)
            citations.append(
                {
                    "id": item.get("id", ""),
                    "title": source,
                    "documentTitle": source,
                    "documentId": item.get("document_id", ""),
                    "chunkIndex": position + 1,
                    "snippet": snippet[:220],
                    "score": score,
                    "relevanceScore": score,
                    "vectorScore": float(item.get("vector_score") or 0),
                    "lexicalScore": float(item.get("lexical_score") or 0),
                    "chunkId": item.get("id", ""),
                    "sourceName": source,
                    "segmentId": item.get("id", ""),
                }
            )
        return citations

    def _infer_evidence_level(self, citations: list[dict[str, Any]], penalties: list[str]) -> str:
        if not citations:
            return "low"

        scores = sorted(
            [float(item.get("relevanceScore") or item.get("score") or 0) for item in citations],
            reverse=True,
        )
        best_score = scores[0] if scores else 0.0
        if penalties:
            if best_score >= 0.5 and len(citations) >= 3:
                return "partial"
            return "low"
        if best_score >= 0.5 and len(citations) >= 3:
            return "sufficient"
        if best_score >= 0.2 or len(citations) >= 2:
            return "partial"
        return "low"

    def _llm_available(self) -> bool:
        return bool(self._settings.model_base_url and self._settings.model_name)

    def _call_json_prompt(self, *, prompt: str, model_name: str | None, fallback: dict[str, Any]) -> dict[str, Any]:
        try:
            response_text = self._call_openai_compatible(
                [{"role": "system", "content": prompt}],
                model_name or self._settings.model_name,
                temperature=0.1,
            )
            parsed = self._parse_json_object(response_text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return fallback
        return fallback

    def _call_openai_compatible(
        self,
        messages: list[dict[str, str]],
        model_name: str,
        *,
        temperature: float = 0.2,
        max_tokens: int | None = None,
        timeout_seconds: float | None = None,
    ) -> str:
        payload = {"model": model_name, "messages": messages, "temperature": temperature}
        if max_tokens:
            payload["max_tokens"] = max_tokens
        headers = {
            "Authorization": f"Bearer {self._settings.model_api_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=timeout_seconds or self._settings.model_timeout_seconds) as client:
            response = client.post(
                f"{self._settings.model_base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                detail = response.text[:1000]
                raise RuntimeError(
                    f"model API returned {response.status_code} for "
                    f"{self._settings.model_base_url}/chat/completions: {detail}"
                ) from exc
            data = response.json()
        return data["choices"][0]["message"]["content"]

    def _parse_json_object(self, value: str) -> dict[str, Any] | list[Any] | None:
        text = value.strip()
        if not text:
            return None

        fence_match = re.search(r"```(?:json)?\s*(\{.*\}|\[.*\])\s*```", text, re.S)
        if fence_match:
            text = fence_match.group(1)
        else:
            object_start = text.find("{")
            object_end = text.rfind("}")
            array_start = text.find("[")
            array_end = text.rfind("]")
            if object_start >= 0 and object_end > object_start:
                text = text[object_start : object_end + 1]
            elif array_start >= 0 and array_end > array_start:
                text = text[array_start : array_end + 1]

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None
