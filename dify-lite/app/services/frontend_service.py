from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.config import Settings
from app.core.document_loader import load_document
from app.services.chat_service import ChatService
from app.services.design_pipeline import DesignPipeline
from app.services.handover_pipeline import HandoverPipeline
from app.services.ingestion_service import IngestionService
from app.services.retrieval_service import RetrievalService
from app.storage.repository import Repository


class FrontendService:
    def __init__(
        self,
        settings: Settings,
        repository: Repository,
        ingestion_service: IngestionService,
        retrieval_service: RetrievalService,
        chat_service: ChatService,
    ):
        self._settings = settings
        self._repository = repository
        self._ingestion_service = ingestion_service
        self._retrieval_service = retrieval_service
        self._chat_service = chat_service
        self._design_pipeline = DesignPipeline(self)
        self._handover_pipeline = HandoverPipeline(self)

    def _scene_model_timeout_seconds(self) -> float:
        return max(180.0, float(self._settings.model_timeout_seconds or 60.0))

    def list_documents(self) -> list[dict[str, Any]]:
        return [self._normalize_document(item) for item in self._repository.list_documents()]

    def suggest_chat_questions(self, payload: dict[str, Any]) -> dict[str, Any]:
        project = self._payload_text(payload, "project")
        collection_key = (
            payload.get("collection_id")
            or payload.get("collectionId")
            or payload.get("knowledge_base_id")
            or payload.get("knowledgeBaseId")
            or ""
        ).strip()
        collection = self._resolve_collection_for_suggestions(project=project, collection_id=collection_key)
        documents = self._get_suggestion_documents(collection=collection, project=project)
        queries = self._build_suggestion_queries(documents=documents, project=project or (collection or {}).get("name", ""))
        retrieval: dict[str, Any] = {"hits": [], "warning": ""}
        if collection and queries:
            retrieval = self._retrieval_service.retrieve_many(
                collection_id=collection["id"],
                queries=queries,
                top_k=5,
            )
        hits = retrieval.get("hits", [])[:8]
        fallback_items = self._build_suggested_question_fallback(
            documents=documents,
            hits=hits,
            project=project or (collection or {}).get("name", ""),
        )
        items = fallback_items
        source = "retrieval-fallback"
        warnings = [retrieval.get("warning", "")]

        if documents or hits:
            generation = self._chat_service.generate_json_with_task_prompt(
                task_prompt=(
                    "你是软件研发知识库的产品型问题推荐器。"
                    "请只基于用户当前选择的知识库、项目、文档标题和检索片段，生成 6 个适合智能问答入口展示的猜你想问。"
                    "问题要面向软件研发团队，优先覆盖：业务对象、模块职责、业务规则、权限风险、流程关系、证据缺口。"
                    "不要编造文档中没有出现的产品、模块或事实。"
                    "输出严格 JSON：{\"questions\":[{\"label\":\"短按钮文案\",\"question\":\"完整问题\",\"reason\":\"推荐理由\"}]}"
                ),
                user_payload={
                    "project": project,
                    "collection": collection or {},
                    "documents": [
                        {
                            "title": item.get("title") or item.get("original_name") or item.get("filename") or "",
                            "type": item.get("doc_type") or "",
                            "summary": item.get("summary") or "",
                            "scene": item.get("scene") or "",
                        }
                        for item in documents[:12]
                    ],
                    "retrieval_hits": [
                        {
                            "sourceDocument": (hit.get("metadata") or {}).get("source_name")
                            or (hit.get("metadata") or {}).get("title")
                            or "",
                            "snippet": str(hit.get("content") or "")[:500],
                            "score": hit.get("score") or 0,
                        }
                        for hit in hits
                    ],
                },
                max_tokens=900,
                timeout_seconds=45,
            )
            model_items = self._normalize_suggested_questions(generation.get("parsed"))
            if model_items:
                items = model_items
                source = generation.get("provider") or "openai-compatible"
            elif generation.get("warning"):
                warnings.append(generation["warning"])

        return {
            "items": items[:6],
            "source": source,
            "project": project or (collection or {}).get("name", ""),
            "collection": collection or {},
            "documentCount": len(documents),
            "retrieval": {
                "queries": queries,
                "hitCount": len(hits),
                "warning": retrieval.get("warning", ""),
            },
            "warning": "；".join(item for item in warnings if item),
        }

    def _resolve_collection_for_suggestions(self, *, project: str, collection_id: str) -> dict[str, Any] | None:
        for value in [collection_id, project]:
            if not value:
                continue
            collection = self._repository.get_collection(value) or self._repository.get_collection_by_name(value)
            if collection:
                return collection
        collections = self._repository.list_collections()
        return collections[0] if collections else None

    def _get_suggestion_documents(self, *, collection: dict[str, Any] | None, project: str) -> list[dict[str, Any]]:
        if collection:
            documents = self._repository.list_documents(collection_id=collection["id"])
        else:
            documents = self._repository.list_documents()
        if project:
            filtered = [
                item
                for item in documents
                if project in {
                    item.get("project", ""),
                    item.get("collection_name", ""),
                    item.get("collection_id", ""),
                }
            ]
            if filtered:
                documents = filtered
        return documents

    def _build_suggestion_queries(self, *, documents: list[dict[str, Any]], project: str) -> list[str]:
        topics = self._extract_question_topics(documents=documents, hits=[])
        scope = " ".join(part for part in [project, " ".join(topics[:5])] if part).strip() or "当前项目"
        return [
            f"{scope} 核心业务对象 模块职责",
            f"{scope} 业务规则 状态流转 权限风险",
            f"{scope} 流程关系 接口依赖 证据缺口",
        ]

    def _build_suggested_question_fallback(
        self,
        *,
        documents: list[dict[str, Any]],
        hits: list[dict[str, Any]],
        project: str,
    ) -> list[dict[str, str]]:
        topics = self._extract_question_topics(documents=documents, hits=hits)
        if not topics:
            topics = [project or "当前项目"]
        primary = topics[0]
        relation_scope = "、".join(topics[:5]) if len(topics) > 1 else f"{primary}相关模块和文档"
        candidates = [
            (f"{primary}支持哪些业务？", f"{primary}主要支持哪些业务能力？"),
            (f"{relation_scope}之间的关系", f"{relation_scope}之间是什么关系？"),
            (f"{primary}业务规则", f"{primary}有哪些关键业务规则和限制条件？"),
            (f"{primary}权限风险", f"{primary}涉及哪些权限边界和风险点？"),
            (f"{primary}关键流程", f"{primary}从发起到完成的关键流程是什么？"),
            ("哪些内容证据不足？", f"当前知识库中关于{primary}还缺少哪些文档证据？"),
        ]
        items = []
        seen: set[str] = set()
        for label, question in candidates:
            if question in seen:
                continue
            seen.add(question)
            items.append(
                {
                    "label": label[:24],
                    "question": question,
                    "reason": "根据当前项目文档标题和检索片段自动生成。",
                }
            )
        return items

    def _normalize_suggested_questions(self, payload: Any) -> list[dict[str, str]]:
        if isinstance(payload, dict):
            raw_items = payload.get("questions") or payload.get("items") or []
        elif isinstance(payload, list):
            raw_items = payload
        else:
            raw_items = []

        items = []
        seen: set[str] = set()
        for raw in raw_items:
            if isinstance(raw, str):
                question = raw.strip()
                label = question
                reason = "由模型基于当前知识库生成。"
            elif isinstance(raw, dict):
                question = str(raw.get("question") or raw.get("text") or raw.get("query") or "").strip()
                label = str(raw.get("label") or raw.get("title") or question).strip()
                reason = str(raw.get("reason") or raw.get("description") or "由模型基于当前知识库生成。").strip()
            else:
                continue
            if not question or question in seen:
                continue
            seen.add(question)
            items.append(
                {
                    "label": label[:24],
                    "question": question,
                    "reason": reason[:120],
                }
            )
        return items

    def _extract_question_topics(self, *, documents: list[dict[str, Any]], hits: list[dict[str, Any]]) -> list[str]:
        text_parts = [
            item.get("title") or item.get("original_name") or item.get("filename") or ""
            for item in documents[:12]
        ]
        text_parts.extend(str(hit.get("content") or "")[:260] for hit in hits[:8])
        text = " ".join(text_parts)
        preferred = [
            "客户",
            "商机",
            "合同",
            "回款",
            "发票",
            "权限",
            "审批",
            "接口",
            "测试",
            "部署",
            "需求",
            "交接",
            "培训",
        ]
        topics = [item for item in preferred if item in text]
        for title in text_parts:
            cleaned = self._clean_question_topic(title)
            if cleaned and cleaned not in topics:
                topics.append(cleaned)
        return topics[:8]

    def _clean_question_topic(self, value: str) -> str:
        text = Path(str(value or "")).stem
        text = re.sub(r"^\d+[_\-.\s]*", "", text)
        text = re.sub(r"(?i)SuperRAG|CRM|V\d+(\.\d+)*|final|最终版|演示整理版", "", text)
        text = re.sub(r"(模块|管理|说明|文档|设计|规格|需求|手册|记录|资料|流程)+", "", text)
        text = re.sub(r"[_\-（）()\s]+", "", text).strip("，。；、")
        return text[:10]

    def import_document(
        self,
        *,
        title: str,
        doc_type: str,
        project: str,
        version: str,
        scene: str,
        summary: str,
        upload: Any,
        clean_enabled: bool,
        chunk_size: int | None,
        chunk_overlap: int | None,
    ) -> dict[str, Any]:
        collection = self._resolve_or_create_collection(project)
        result = self._ingestion_service.import_document(
            collection_id=collection["id"],
            upload=upload,
            clean_enabled=clean_enabled,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            title=title,
            doc_type=doc_type,
            project=project,
            version=version,
            scene=scene,
            summary=summary,
        )
        return {
            "document": self._normalize_document(result["document"]),
            "collection": collection,
            "chunks_indexed": result["chunks_indexed"],
            "warnings": result.get("warnings", []),
        }

    def run_scene(self, scene: str, payload: dict[str, Any]) -> dict[str, Any]:
        query = (payload.get("query") or "").strip()
        if not query:
            raise ValueError("query is required")

        collection = self._resolve_collection(
            project=self._payload_text(payload, "project"),
            collection_id=(
                payload.get("collection_id")
                or payload.get("collectionId")
                or payload.get("knowledge_base_id")
                or payload.get("knowledgeBaseId")
                or ""
            ).strip(),
        )
        if scene in {"design", "handover"}:
            try:
                if scene == "design":
                    return self._design_pipeline.run(payload=payload, collection=collection, query=query)
                return self._handover_pipeline.run(payload=payload, collection=collection, query=query)
            except Exception as exc:
                result = self._run_engineering_scene(scene=scene, payload=payload, collection=collection, query=query)
                result.setdefault("technicalWarnings", []).append(
                    f"{scene} pipeline failed, legacy scene runner used: {exc}"
                )
                return result

        scene_prompt = self._build_system_prompt(scene, payload)
        scene_context = self._build_scene_context(scene, payload)
        if scene == "design":
            answer = self._chat_service.answer_with_task_prompt(
                collection_id=collection["id"],
                query=query,
                top_k=5,
                task_prompt=scene_prompt,
                scene=scene,
                context=scene_context,
            )
        else:
            answer = self._chat_service.answer(
                collection_id=collection["id"],
                query=query,
                top_k=5,
                system_prompt=scene_prompt,
                scene=scene,
                context=scene_context,
            )

        retrieval_hits = answer.get("retrieval", {}).get("hits", [])
        evidence_lines = self._build_evidence_from_bundle(answer.get("evidence_collector", {}))
        risks = self._build_risks(scene) + answer.get("missing_information", [])
        unsupported_claims = answer.get("validator", {}).get("unsupported_claims", [])
        if unsupported_claims:
            risks.append("存在缺少证据支撑的结论：" + "；".join(unsupported_claims[:3]))
        result = {
            "scene": scene,
            "source": "Dify Lite + DCRRM",
            "title": f"{self._scene_label(scene)}结果",
            "summary": answer["answer"],
            "evidence": evidence_lines,
            "risks": risks,
            "nextActions": answer.get("implementation_suggestions") or self._build_next_actions(scene, payload),
            "artifacts": self._build_artifacts(scene, payload, retrieval_hits),
            "citations": answer.get("citations", []),
            "evidenceLevel": answer.get("evidenceLevel", "low"),
            "structuredAnswer": answer.get("structured_answer", {}),
            "pipelineVersion": answer.get("pipeline_version", ""),
            "pipelineSteps": answer.get("pipeline_steps", []),
            "pipeline": answer.get("pipeline", {}),
            "queryDesigner": answer.get("query_designer", {}),
            "retriever": answer.get("retriever", {}),
            "evidenceCollector": answer.get("evidence_collector", {}),
            "answerGenerator": answer.get("answer_generator", {}),
            "validator": answer.get("validator", {}),
            "missingInformation": answer.get("missing_information", []),
            "implementationSuggestions": answer.get("implementation_suggestions", []),
            "uncertainPoints": answer.get("uncertain_points", []),
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
        }
        if answer.get("warning"):
            result["warning"] = answer["warning"]
        if scene == "design":
            structured_design = self._parse_design_json(answer["answer"])
            if structured_design:
                result.update(structured_design)
        return result

    def _run_engineering_scene(
        self,
        *,
        scene: str,
        payload: dict[str, Any],
        collection: dict[str, Any],
        query: str,
    ) -> dict[str, Any]:
        evidence_context = self._retrieve_scene_evidence(scene=scene, collection_id=collection["id"], query=query, payload=payload)
        task_prompt = (
            self._build_design_prompt(payload, evidence_context=evidence_context)
            if scene == "design"
            else self._build_handover_prompt(payload)
        )
        generation = self._chat_service.generate_json_with_task_prompt(
            task_prompt=task_prompt,
            user_payload={
                "question": query,
                "scene": scene,
                "requestContext": self._build_scene_context(scene, payload),
                "retrievalContext": self._build_model_retrieval_context(evidence_context),
            },
            max_tokens=2800 if scene == "design" else 1800,
            timeout_seconds=self._scene_model_timeout_seconds(),
        )

        fallback_used = not isinstance(generation.get("parsed"), dict)
        if scene == "design":
            fallback = self._build_design_fallback(query=query, payload=payload, evidence_context=evidence_context)
            structured = self._normalize_design_payload(generation.get("parsed") if not fallback_used else fallback, fallback=fallback)
            structured = self._complete_sparse_design_payload(structured, fallback)
            summary = self._summarize_design_result(structured)
            artifacts = self._build_design_artifacts(structured)
        else:
            fallback = self._build_handover_fallback(query=query, payload=payload, evidence_context=evidence_context)
            structured = self._normalize_handover_payload(generation.get("parsed") if not fallback_used else fallback, fallback=fallback)
            summary = self._summarize_handover_result(structured)
            artifacts = self._build_handover_artifacts(structured)

        warnings = [
            item
            for item in [
                self._friendly_generation_warning(generation, fallback_used=fallback_used),
            ]
            if item
        ]
        citations = self._build_citations(evidence_context["raw_hits"])
        evidence_level = self._infer_scene_evidence_level(citations, structured)
        evidence_lines = self._build_evidence(evidence_context["raw_hits"])
        source = "retrieval-fallback" if fallback_used else generation.get("provider", "openai-compatible")
        result = {
            "scene": scene,
            "source": source,
            "title": f"{self._scene_label(scene)}结果",
            "summary": summary,
            "answer": generation.get("answer", ""),
            "rawAnswer": generation.get("answer", ""),
            "evidence": evidence_lines,
            "citations": citations,
            "evidenceLevel": evidence_level,
            "structuredAnswer": structured,
            "structuredOutput": structured,
            "artifacts": artifacts,
            "retriever": {
                "queries": [item["query"] for item in evidence_context["queries"]],
                "groups": evidence_context["groups"],
                "hit_count": len(evidence_context["hits"]),
                "warning": evidence_context.get("warning", ""),
            },
            "pipelineVersion": "aucmr-scene-generator-v1",
            "pipelineSteps": [
                "multi_query_retrieval",
                "grouped_evidence_context",
                "business_rule_extraction",
                "structured_artifact_generation",
                "evidence_coverage_check",
            ],
            "pipeline": {
                "version": "aucmr-scene-generator-v1",
                "steps": [
                    {
                        "name": "multi_query_retrieval",
                        "status": "completed",
                        "output": {
                            "queries": [item["query"] for item in evidence_context["queries"]],
                            "hit_count": len(evidence_context["hits"]),
                        },
                    },
                    {
                        "name": "structured_artifact_generation",
                        "status": "completed" if not fallback_used else "fallback",
                        "output": {
                            "provider": source,
                            "warning": generation.get("warning", ""),
                        },
                    },
                ],
            },
            "queryDesigner": {
                "queries": [item["query"] for item in evidence_context["queries"]],
                "reason": f"{self._scene_label(scene)}使用场景子问题进行多路检索。",
            },
            "evidenceCollector": {
                "groups": evidence_context["groups"],
                "evidence": evidence_context["hits"],
                "missing_information": structured.get("openQuestions")
                or structured.get("informationGaps")
                or [],
            },
            "answerGenerator": {
                "provider": source,
                "raw_answer": generation.get("answer", ""),
                "fallback_used": fallback_used,
            },
            "validator": {
                "valid_claims": [item.get("conclusion", "") for item in structured.get("evidenceMap", []) if isinstance(item, dict)],
                "unsupported_claims": structured.get("openQuestions") or structured.get("informationGaps") or [],
                "uncertain_claims": structured.get("openQuestions") or structured.get("informationGaps") or [],
                "final_revision_advice": self._coverage_review_suggestion(structured),
            },
            "missingInformation": structured.get("openQuestions") or structured.get("informationGaps") or [],
            "uncertainPoints": structured.get("openQuestions") or structured.get("informationGaps") or [],
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
        }
        if warnings:
            result["warning"] = "; ".join(warnings)
        if evidence_context.get("warning") or generation.get("warning"):
            result["technicalWarnings"] = [
                item
                for item in [
                    evidence_context.get("warning", ""),
                    generation.get("warning", ""),
                ]
                if item
            ]
        result.update(structured)
        if fallback_used and self._structured_fallback_is_usable(scene, structured):
            result.pop("warning", None)
            result["fallbackNotice"] = self._friendly_generation_warning(generation, fallback_used=True)
        return result

    def _build_engineering_scene_result(
        self,
        *,
        scene: str,
        payload: dict[str, Any],
        collection: dict[str, Any],
        evidence_context: dict[str, Any],
        generation: dict[str, Any],
        structured: dict[str, Any],
        summary: str,
        artifacts: list[dict[str, Any]],
        fallback_used: bool,
        json_repaired: bool,
        validator_warnings: list[str],
        pipeline_version: str,
    ) -> dict[str, Any]:
        citations = self._build_citations(evidence_context["raw_hits"])
        evidence_level = self._infer_scene_evidence_level(citations, structured)
        evidence_lines = self._build_evidence(evidence_context["raw_hits"])
        source = "retrieval-fallback" if fallback_used else generation.get("provider", "openai-compatible")
        structured_source = structured.get("source", "")
        quality_assessment = structured.get("qualityAssessment") or self._build_scene_quality_assessment(
            scene,
            structured,
            citations,
        )
        missing_information = structured.get("openQuestions") or structured.get("informationGaps") or []
        warnings = self._public_scene_warnings(
            [
                *validator_warnings,
                evidence_context.get("warning", ""),
                generation.get("warning", ""),
            ]
        )
        result = {
            "scene": scene,
            "source": source,
            "structuredSource": structured_source,
            "generationMode": self._generation_mode(source, fallback_used=fallback_used, json_repaired=json_repaired),
            "title": f"{self._scene_label(scene)}结果",
            "summary": summary,
            "answer": generation.get("answer", ""),
            "rawAnswer": generation.get("answer", ""),
            "evidence": evidence_lines,
            "citations": citations,
            "evidenceLevel": evidence_level,
            "structuredAnswer": structured,
            "structuredOutput": structured,
            "artifacts": artifacts,
            "qualityAssessment": quality_assessment,
            "retriever": {
                "queries": [item["query"] for item in evidence_context["queries"]],
                "groups": evidence_context["groups"],
                "hit_count": len(evidence_context["hits"]),
                "warning": evidence_context.get("warning", ""),
            },
            "pipelineVersion": pipeline_version,
            "pipelineSteps": [
                "multi_query_retrieval",
                "grouped_evidence_context",
                "business_rule_extraction" if scene == "design" else "handover_fact_extraction",
                "structured_artifact_generation",
                "schema_validation",
                "evidence_coverage_check",
            ],
            "pipeline": {
                "version": pipeline_version,
                "steps": [
                    {
                        "name": "multi_query_retrieval",
                        "status": "completed",
                        "output": {
                            "queries": [item["query"] for item in evidence_context["queries"]],
                            "hit_count": len(evidence_context["hits"]),
                        },
                    },
                    {
                        "name": "structured_artifact_generation",
                        "status": "fallback" if fallback_used else ("json_repaired" if json_repaired else "completed"),
                        "output": {
                            "provider": source,
                            "warning": generation.get("warning", ""),
                        },
                    },
                    {
                        "name": "schema_validation",
                        "status": "completed",
                        "output": quality_assessment,
                    },
                ],
            },
            "queryDesigner": {
                "queries": [item["query"] for item in evidence_context["queries"]],
                "reason": f"{self._scene_label(scene)}使用场景子问题进行多路检索。",
            },
            "evidenceCollector": {
                "groups": evidence_context["groups"],
                "evidence": evidence_context["hits"],
                "missing_information": missing_information,
            },
            "answerGenerator": {
                "provider": source,
                "raw_answer": generation.get("answer", ""),
                "fallback_used": fallback_used,
                "json_repaired": json_repaired,
            },
            "validator": {
                "valid_claims": [
                    item.get("conclusion", "")
                    for item in structured.get("evidenceMap", [])
                    if isinstance(item, dict)
                ],
                "unsupported_claims": missing_information,
                "uncertain_claims": missing_information,
                "final_revision_advice": self._coverage_review_suggestion(structured),
                "qualityAssessment": quality_assessment,
            },
            "missingInformation": missing_information,
            "uncertainPoints": missing_information,
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
        }
        if warnings:
            result["technicalWarnings"] = warnings
        if fallback_used and self._structured_fallback_is_usable(scene, structured):
            result["fallbackNotice"] = self._friendly_generation_warning(generation, fallback_used=True)
        elif warnings:
            result["warning"] = "; ".join(warnings)

        result.update(structured)
        result["source"] = source
        result["structuredSource"] = structured_source
        result["generationMode"] = self._generation_mode(source, fallback_used=fallback_used, json_repaired=json_repaired)
        result["qualityAssessment"] = quality_assessment
        return result

    def _public_scene_warnings(self, warnings: list[Any]) -> list[str]:
        public_warnings: list[str] = []
        for warning in warnings:
            text = str(warning or "").strip()
            if not text:
                continue
            if "model JSON was repaired and used" in text:
                continue
            if "vector search unavailable" in text and self._settings.vector_store != "weaviate":
                continue
            if text not in public_warnings:
                public_warnings.append(text)
        return public_warnings

    def _generation_mode(self, source: str, *, fallback_used: bool, json_repaired: bool) -> str:
        if json_repaired:
            return "json-repaired-model"
        if fallback_used:
            return "retrieval-fallback"
        if source == "mock":
            return "mock-fallback"
        return "model"

    def _friendly_generation_warning(self, generation: dict[str, Any], *, fallback_used: bool) -> str:
        if not fallback_used:
            return ""

        warning = str(generation.get("warning") or "").strip()
        provider = str(generation.get("provider") or "").strip()
        if provider == "retrieval-fallback" and "model is not configured" in warning:
            return "当前未配置真实模型接口，系统已使用检索片段生成结构化兜底结果。"
        if "structured JSON parsing failed" in warning:
            return "模型返回内容不是严格 JSON，系统已自动切换为检索结构化兜底结果。"
        if "model generation failed" in warning:
            return "模型调用暂不可用，系统已使用本地检索片段生成结构化兜底结果。"
        return warning or "系统已使用检索结构化兜底结果。"

    def _structured_fallback_is_usable(self, scene: str, structured: dict[str, Any]) -> bool:
        if scene == "design":
            return bool(structured.get("functionList")) and bool(structured.get("useCases"))
        if scene == "handover":
            return bool(structured.get("todoList")) or bool(structured.get("riskRegister")) or bool(structured.get("currentProgress"))
        return False

    def _build_model_retrieval_context(self, evidence_context: dict[str, Any]) -> dict[str, Any]:
        compact_hits = [
            self._compact_model_hit(hit)
            for hit in evidence_context.get("hits", [])[:10]
        ]
        compact_groups = []
        for group in evidence_context.get("groups", []):
            compact_groups.append(
                {
                    "name": group.get("name", ""),
                    "query": group.get("query", ""),
                    "hits": [self._compact_model_hit(hit) for hit in self._as_list(group.get("hits"))[:2]],
                }
            )
        return {
            "queries": evidence_context.get("queries", []),
            "groups": compact_groups,
            "hits": compact_hits,
        }

    def _compact_model_hit(self, hit: dict[str, Any]) -> dict[str, Any]:
        snippet = re.sub(r"\s+", " ", str(hit.get("snippet") or "")).strip()
        return {
            "sourceDocument": hit.get("sourceDocument") or hit.get("sourceName") or "知识库片段",
            "snippet": snippet[:420],
            "score": round(float(hit.get("score") or 0), 4),
            "vectorScore": round(float(hit.get("vectorScore") or hit.get("vector_score") or 0), 4),
            "lexicalScore": round(float(hit.get("lexicalScore") or hit.get("lexical_score") or 0), 4),
            "matchedQueries": hit.get("matchedQueries") or hit.get("matched_queries") or [],
        }

    def health(self) -> dict[str, Any]:
        collections = self._repository.list_collections()
        documents = self._repository.list_documents()
        return {
            "status": "ok",
            "service": self._settings.app_name,
            "collections": len(collections),
            "documents": len(documents),
        }

    def get_document_source(
        self,
        *,
        document_id: str = "",
        chunk_id: str = "",
        source_name: str = "",
    ) -> dict[str, Any]:
        chunk = self._repository.get_chunk(chunk_id) if chunk_id else None
        document = self._resolve_source_document(document_id=document_id, chunk=chunk, source_name=source_name)
        if not document:
            raise ValueError("document source not found")

        document_chunks = self._repository.get_chunks_for_document(document["id"])
        preview_chunk = chunk
        if not preview_chunk and document_chunks:
            preview_chunk = document_chunks[0]

        return {
            "sourceType": "uploaded",
            "document": self._normalize_document(document),
            "chunk": self._serialize_chunk(preview_chunk),
            "content": self._read_document_content(document, document_chunks),
        }

    def get_document_detail(self, document_id: str) -> dict[str, Any]:
        document = self._repository.get_document(document_id)
        if not document:
            raise ValueError("document not found")

        chunks = self._repository.get_chunks_for_document(document_id)
        detail = self._normalize_document(document, chunks=chunks)
        detail["chunksPreview"] = [self._serialize_chunk(chunk) for chunk in chunks[:5]]
        detail["qualityChecks"] = self._build_document_quality_checks(document, chunks)
        detail["referenceStats"] = self._build_document_reference_stats(document)
        detail["ingestionLogs"] = self._build_document_ingestion_logs(detail)
        detail["knowledgeCategory"] = self._infer_document_category(detail)
        return detail

    def get_document_chunks(self, document_id: str, limit: int = 20) -> dict[str, Any]:
        document = self._repository.get_document(document_id)
        if not document:
            raise ValueError("document not found")

        chunks = self._repository.get_chunks_for_document(document_id)
        safe_limit = max(1, min(int(limit or 20), 100))
        return {
            "document": self._normalize_document(document, chunks=chunks),
            "items": [self._serialize_chunk(chunk) for chunk in chunks[:safe_limit]],
            "total": len(chunks),
        }

    def create_artifact(self, payload: dict[str, Any]) -> dict[str, Any]:
        scene = self._normalize_scene(payload.get("scene") or payload.get("sceneMode") or "general")
        created_at = str(payload.get("createdAt") or payload.get("created_at") or "")
        artifact_id = str(payload.get("id") or payload.get("artifactId") or "").strip()
        artifact_type = str(payload.get("artifactType") or payload.get("artifact_type") or scene).strip() or scene
        record = {
            "id": artifact_id,
            "scene": scene,
            "artifact_type": artifact_type,
            "title": payload.get("title") or "未命名历史产物",
            "query": payload.get("query") or payload.get("originalQuestion") or payload.get("original_question") or "",
            "project": self._payload_text(payload, "project"),
            "output_summary": payload.get("outputSummary") or payload.get("output_summary") or payload.get("summary") or "",
            "structured_output": payload.get("structuredOutput") or payload.get("structured_output") or payload.get("structuredAnswer") or {},
            "quality_assessment": payload.get("qualityAssessment") or payload.get("quality_assessment") or {},
            "review_status": payload.get("reviewStatus") or payload.get("review_status") or "草稿",
            "human_notes": payload.get("humanNotes") or payload.get("human_notes") or "",
            "creator": payload.get("creator") or "course-demo-user",
            "created_at": created_at,
        }
        if not record["quality_assessment"]:
            record["quality_assessment"] = self._build_scene_quality_assessment(
                scene,
                record["structured_output"],
                self._as_list(payload.get("citations")),
            )
        saved = self._repository.save_artifact(record)
        artifact_id = saved["id"]
        created_at = saved.get("created_at") or created_at
        citations = [
            self._normalize_citation(
                item,
                scene=scene,
                artifact_id=artifact_id,
                artifact_type=artifact_type,
                created_at=created_at,
            )
            for item in self._as_list(payload.get("citations"))
            if item
        ]
        record["id"] = artifact_id
        record["created_at"] = created_at
        record["citations"] = citations
        saved = self._repository.save_artifact(record)
        version_count = self._repository.count_artifact_versions(artifact_id)
        self._repository.save_artifact_version(
            artifact_id=artifact_id,
            version=str(payload.get("version") or f"v{version_count + 1}"),
            operator=str(payload.get("operator") or payload.get("creator") or record["creator"]),
            change_summary=str(payload.get("changeSummary") or payload.get("change_summary") or "生成并保存历史产物"),
            snapshot=self._artifact_version_snapshot(saved),
        )
        saved["version_records"] = self._repository.list_artifact_versions(artifact_id)
        return self._serialize_artifact(saved)

    def list_artifacts(self, params: dict[str, Any]) -> list[dict[str, Any]]:
        scene = self._normalize_scene(params.get("scene") or params.get("sceneMode") or "")
        project = str(params.get("project") or "").strip()
        keyword = str(params.get("keyword") or "").strip()
        return [
            self._serialize_artifact(item)
            for item in self._repository.list_artifacts(scene=scene, project=project, keyword=keyword)
        ]

    def get_artifact(self, artifact_id: str) -> dict[str, Any]:
        artifact = self._repository.get_artifact(artifact_id)
        if not artifact:
            raise ValueError("artifact not found")
        return self._serialize_artifact(artifact)

    def update_artifact_review(self, artifact_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        review_status = str(payload.get("reviewStatus") or payload.get("review_status") or "待复核")
        human_notes = str(payload.get("humanNotes") or payload.get("human_notes") or "")
        artifact = self._repository.update_artifact_review(
            artifact_id,
            review_status=review_status,
            human_notes=human_notes,
        )
        if not artifact:
            raise ValueError("artifact not found")
        version_count = self._repository.count_artifact_versions(artifact_id)
        self._repository.save_artifact_version(
            artifact_id=artifact_id,
            version=str(payload.get("version") or f"v{version_count + 1}"),
            operator=str(payload.get("operator") or artifact.get("creator") or "course-demo-user"),
            change_summary=str(
                payload.get("changeSummary")
                or payload.get("change_summary")
                or f"人工复核状态更新为：{review_status}"
            ),
            snapshot=self._artifact_version_snapshot(artifact),
        )
        artifact["version_records"] = self._repository.list_artifact_versions(artifact_id)
        return self._serialize_artifact(artifact)

    def delete_artifact(self, artifact_id: str) -> dict[str, Any]:
        return {"success": self._repository.delete_artifact(artifact_id), "id": artifact_id}

    def get_document_references(self, document_id: str) -> dict[str, Any]:
        document = self._repository.get_document(document_id)
        if not document:
            raise ValueError("document not found")

        title_candidates = {
            str(document.get("title") or "").strip(),
            str(document.get("original_name") or "").strip(),
            str(document.get("filename") or "").strip(),
        }
        title_candidates.discard("")
        references: list[dict[str, Any]] = []
        chunk_counter: dict[str, dict[str, Any]] = {}
        scene_counts = {"general": 0, "training": 0, "handover": 0, "design": 0}

        for artifact in self._repository.list_artifacts():
            matched_citations = []
            for citation in artifact.get("citations", []):
                citation_document_id = str(citation.get("documentId") or citation.get("document_id") or "")
                citation_title = str(citation.get("documentTitle") or citation.get("title") or "").strip()
                if citation_document_id == document_id or citation_title in title_candidates:
                    matched_citations.append(citation)

            if not matched_citations:
                continue

            scene = self._normalize_scene(artifact.get("scene") or "general")
            scene_counts[scene] = scene_counts.get(scene, 0) + len(matched_citations)
            for citation in matched_citations:
                chunk_id = citation.get("chunkId") or citation.get("chunk_id") or citation.get("id") or ""
                if chunk_id:
                    chunk_record = chunk_counter.setdefault(
                        chunk_id,
                        {
                            "chunkId": chunk_id,
                            "chunkIndex": citation.get("chunkIndex") or citation.get("chunk_index") or "",
                            "snippet": citation.get("snippet") or "",
                            "count": 0,
                            "documentTitle": citation.get("documentTitle") or document.get("title") or "",
                        },
                    )
                    chunk_record["count"] += 1

            references.append(
                {
                    "artifactId": artifact["id"],
                    "artifactType": artifact.get("artifact_type") or scene,
                    "scene": scene,
                    "title": artifact.get("title") or "历史产物",
                    "query": artifact.get("query") or "",
                    "project": artifact.get("project") or "",
                    "createdAt": artifact.get("created_at") or "",
                    "reviewStatus": artifact.get("review_status") or "草稿",
                    "citationCount": len(matched_citations),
                    "citations": matched_citations,
                }
            )

        references.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
        top_chunks = sorted(chunk_counter.values(), key=lambda item: item["count"], reverse=True)[:8]
        return {
            "document": self._normalize_document(document),
            "totalReferences": sum(item["citationCount"] for item in references),
            "lastReferencedAt": references[0]["createdAt"] if references else "",
            "referencesByScene": scene_counts,
            "referencedArtifacts": references,
            "topReferencedChunks": top_chunks,
        }

    def get_knowledge_gaps(self) -> dict[str, Any]:
        artifacts = self._repository.list_artifacts()
        gap_map: dict[str, dict[str, Any]] = {}
        scene_counts: dict[str, int] = {"general": 0, "training": 0, "handover": 0, "design": 0}

        for artifact in artifacts:
            scene = self._normalize_scene(artifact.get("scene") or "general")
            structured = artifact.get("structured_output") or {}
            quality = artifact.get("quality_assessment") or {}
            citations = artifact.get("citations") or []
            gaps = self._extract_artifact_gap_items(artifact=artifact, structured=structured, quality=quality)
            scene_counts[scene] = scene_counts.get(scene, 0) + len(gaps)
            for gap in gaps:
                key = self._gap_key(gap)
                entry = gap_map.setdefault(
                    key,
                    {
                        "id": key,
                        "gapType": gap["gapType"],
                        "sourceScenes": set(),
                        "impactScope": gap["impactScope"],
                        "relatedDocuments": set(),
                        "count": 0,
                        "suggestion": gap["suggestion"],
                        "severity": gap["severity"],
                        "artifactIds": set(),
                        "examples": [],
                    },
                )
                entry["sourceScenes"].add(scene)
                entry["count"] += 1
                entry["artifactIds"].add(artifact.get("id") or "")
                for citation in citations[:3]:
                    document_title = citation.get("documentTitle") or citation.get("title") or ""
                    if document_title:
                        entry["relatedDocuments"].add(document_title)
                if gap.get("relatedDocument"):
                    entry["relatedDocuments"].add(gap["relatedDocument"])
                if len(entry["examples"]) < 3:
                    entry["examples"].append(
                        {
                            "artifactId": artifact.get("id") or "",
                            "artifactTitle": artifact.get("title") or "历史产物",
                            "scene": scene,
                            "description": gap["description"],
                            "createdAt": artifact.get("created_at") or "",
                        }
                    )
                entry["severity"] = self._higher_severity(entry["severity"], gap["severity"])

        items = []
        for entry in gap_map.values():
            items.append(
                {
                    **entry,
                    "sourceScenes": sorted(entry["sourceScenes"]),
                    "relatedDocuments": sorted(entry["relatedDocuments"])[:8],
                    "artifactIds": sorted(item for item in entry["artifactIds"] if item),
                }
            )
        items.sort(key=lambda item: (self._severity_rank(item["severity"]), item["count"]), reverse=True)
        total_gaps = sum(item["count"] for item in items)
        return {
            "summary": {
                "artifactCount": len(artifacts),
                "gapTypeCount": len(items),
                "totalGapOccurrences": total_gaps,
                "highSeverityCount": sum(1 for item in items if item["severity"] == "high"),
                "sceneCounts": scene_counts,
            },
            "items": items,
        }

    def get_demo_center(self) -> dict[str, Any]:
        documents = self.list_documents()
        artifacts = [self._serialize_artifact(item) for item in self._repository.list_artifacts()]
        gaps = self.get_knowledge_gaps()
        total_chunks = sum(int(item.get("chunkCount") or 0) for item in documents)
        total_chars = sum(int(item.get("charCount") or 0) for item in documents)
        scene_counts = {scene: 0 for scene in ["general", "training", "handover", "design"]}
        review_counts = {"草稿": 0, "待复核": 0, "已确认": 0, "需补充证据": 0}
        citation_count = 0
        for artifact in artifacts:
            scene = self._normalize_scene(artifact.get("scene") or artifact.get("sceneMode") or "general")
            scene_counts[scene] = scene_counts.get(scene, 0) + 1
            review_status = str(artifact.get("reviewStatus") or "草稿")
            review_counts[review_status] = review_counts.get(review_status, 0) + 1
            citation_count += len(artifact.get("citations") or [])

        expected_docs = self._demo_expected_documents()
        document_coverage = [
            {
                **item,
                "status": "已入库" if self._match_demo_document(item, documents) else "待上传",
                "matchedDocument": self._match_demo_document(item, documents),
            }
            for item in expected_docs
        ]

        readiness_checks = self._build_demo_readiness_checks(
            documents=documents,
            total_chunks=total_chunks,
            scene_counts=scene_counts,
            citation_count=citation_count,
            gaps=gaps,
            review_counts=review_counts,
        )
        ready_count = sum(1 for item in readiness_checks if item["status"] == "ready")
        return {
            "title": "SuperRAG 答辩演示中心",
            "subtitle": "从 CRM 演示文档到结构化软件工程产物的可解释 RAG 闭环",
            "summary": {
                "documentCount": len(documents),
                "chunkCount": total_chunks,
                "charCount": total_chars,
                "artifactCount": len(artifacts),
                "citationCount": citation_count,
                "knowledgeGapCount": gaps.get("summary", {}).get("gapTypeCount", 0),
                "readyCount": ready_count,
                "checkCount": len(readiness_checks),
            },
            "documentCoverage": document_coverage,
            "artifactSummary": {
                "sceneCounts": scene_counts,
                "reviewCounts": review_counts,
                "recentArtifacts": artifacts[:6],
            },
            "knowledgeGapSummary": gaps.get("summary", {}),
            "topKnowledgeGaps": gaps.get("items", [])[:5],
            "readinessChecks": readiness_checks,
            "flowSteps": self._demo_flow_steps(readiness_checks),
            "recommendedQuestions": self._demo_recommended_questions(),
            "talkingPoints": self._demo_talking_points(),
        }

    def _demo_expected_documents(self) -> list[dict[str, Any]]:
        return [
            {
                "id": "crm-customer",
                "title": "01_CRM客户管理模块说明.md",
                "module": "客户管理",
                "keywords": ["客户", "负责人", "团队成员", "公海"],
                "purpose": "支撑客户对象、负责人权限、重复客户和公海规则分析。",
            },
            {
                "id": "crm-opportunity",
                "title": "02_CRM商机管理模块说明.md",
                "module": "商机管理",
                "keywords": ["商机", "阶段", "赢单", "输单"],
                "purpose": "支撑商机阶段流转、赢单转合同和销售过程风险分析。",
            },
            {
                "id": "crm-contract",
                "title": "03_CRM合同管理模块说明.md",
                "module": "合同管理",
                "keywords": ["合同", "产品", "金额", "审批"],
                "purpose": "支撑合同金额联动、合同状态和删除约束设计。",
            },
            {
                "id": "crm-payment",
                "title": "04_CRM回款管理模块说明.md",
                "module": "回款管理",
                "keywords": ["回款", "计划", "记录", "金额"],
                "purpose": "支撑回款计划、回款记录和合同回款一致性分析。",
            },
            {
                "id": "crm-invoice",
                "title": "05_CRM发票管理模块说明.md",
                "module": "发票管理",
                "keywords": ["发票", "开票", "金额", "合同"],
                "purpose": "支撑发票金额限制、开票流程和异常场景分析。",
            },
        ]

    def _match_demo_document(self, expected: dict[str, Any], documents: list[dict[str, Any]]) -> dict[str, Any] | None:
        keywords = [str(item) for item in expected.get("keywords", [])]
        expected_title = str(expected.get("title") or "")
        for document in documents:
            haystack = " ".join(
                [
                    str(document.get("title") or ""),
                    str(document.get("originalName") or ""),
                    str(document.get("summary") or ""),
                    str(document.get("type") or ""),
                ]
            )
            if expected_title and expected_title in haystack:
                return document
            if keywords and any(keyword in haystack for keyword in keywords):
                return document
        return None

    def _build_demo_readiness_checks(
        self,
        *,
        documents: list[dict[str, Any]],
        total_chunks: int,
        scene_counts: dict[str, int],
        citation_count: int,
        gaps: dict[str, Any],
        review_counts: dict[str, int],
    ) -> list[dict[str, Any]]:
        return [
            {
                "id": "documents",
                "label": "CRM 演示文档已入库",
                "status": "ready" if len(documents) >= 5 else "warning",
                "route": "#/documents",
                "description": f"当前已入库 {len(documents)} 份文档，推荐至少上传 5 份 CRM 演示文档。",
            },
            {
                "id": "chunks",
                "label": "RAG 切片可见",
                "status": "ready" if total_chunks > 0 else "warning",
                "route": "#/documents",
                "description": f"当前知识库包含 {total_chunks} 个 chunk，可在文档详情中查看切片预览。",
            },
            {
                "id": "design",
                "label": "设计辅助产物已生成",
                "status": "ready" if scene_counts.get("design", 0) > 0 else "pending",
                "route": "#/design-assistant",
                "description": f"当前已有 {scene_counts.get('design', 0)} 个设计辅助历史产物。",
            },
            {
                "id": "handover",
                "label": "交接清单已生成",
                "status": "ready" if scene_counts.get("handover", 0) > 0 else "pending",
                "route": "#/handover",
                "description": f"当前已有 {scene_counts.get('handover', 0)} 个交接模式历史产物。",
            },
            {
                "id": "citations",
                "label": "引用证据可追踪",
                "status": "ready" if citation_count > 0 else "warning",
                "route": "#/history",
                "description": f"历史产物累计绑定 {citation_count} 条引用证据。",
            },
            {
                "id": "gaps",
                "label": "知识缺口可解释",
                "status": "ready" if gaps.get("summary", {}).get("gapTypeCount", 0) > 0 else "pending",
                "route": "#/knowledge-gaps",
                "description": f"当前聚合 {gaps.get('summary', {}).get('gapTypeCount', 0)} 类知识缺口。",
            },
            {
                "id": "review",
                "label": "产物复核流程可演示",
                "status": "ready" if review_counts.get("已确认", 0) or review_counts.get("需补充证据", 0) else "pending",
                "route": "#/history",
                "description": "历史产物支持人工复核状态、备注和版本时间线。",
            },
        ]

    def _demo_flow_steps(self, checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        status_by_id = {item["id"]: item["status"] for item in checks}
        return [
            {
                "step": "01",
                "title": "上传 CRM 演示文档",
                "description": "导入客户、商机、合同、回款、发票五类业务文档，形成私有知识库。",
                "route": "#/documents",
                "status": status_by_id.get("documents", "pending"),
            },
            {
                "step": "02",
                "title": "查看 RAG 入库与切片",
                "description": "在文档详情中展示 chunk 数量、切片预览、质量检查和引用记录。",
                "route": "#/documents",
                "status": status_by_id.get("chunks", "pending"),
            },
            {
                "step": "03",
                "title": "生成需求设计产物",
                "description": "用设计辅助生成业务对象、业务规则、文本用例、模块建议和追踪矩阵。",
                "route": "#/design-assistant",
                "status": status_by_id.get("design", "pending"),
            },
            {
                "step": "04",
                "title": "生成项目交接清单",
                "description": "用交接模式生成风险登记表、接手者待办、依赖文档和信息缺口。",
                "route": "#/handover",
                "status": status_by_id.get("handover", "pending"),
            },
            {
                "step": "05",
                "title": "解释证据与知识缺口",
                "description": "查看引用证据、低证据项、待确认问题和建议补充文档。",
                "route": "#/knowledge-gaps",
                "status": status_by_id.get("gaps", "pending"),
            },
            {
                "step": "06",
                "title": "复核并沉淀历史产物",
                "description": "在历史产物中保存复核状态、人工备注和版本记录，形成可复用资产。",
                "route": "#/history",
                "status": status_by_id.get("review", "pending"),
            },
        ]

    def _demo_recommended_questions(self) -> list[dict[str, str]]:
        return [
            {
                "scene": "design",
                "route": "#/design-assistant",
                "question": "请基于 CRM 文档，为客户管理模块生成详细文本用例、业务规则和风险清单",
                "expectedOutput": "业务对象、业务规则、功能清单、文本用例、模块建议、追踪矩阵。",
            },
            {
                "scene": "design",
                "route": "#/design-assistant",
                "question": "请分析合同、回款、发票之间的数据一致性和异常场景",
                "expectedOutput": "跨模块依赖、金额联动规则、异常场景、待确认问题。",
            },
            {
                "scene": "handover",
                "route": "#/handover",
                "question": "请生成 CRM 项目接手者第一周待办清单，并指出缺失资料",
                "expectedOutput": "当前进度、待办清单、风险登记、依赖文档、信息缺口。",
            },
            {
                "scene": "chat",
                "route": "#/chat",
                "question": "客户负责人和团队成员的权限边界是什么？哪些结论证据不足？",
                "expectedOutput": "结论、依据、引用证据、不确定性和补充资料建议。",
            },
            {
                "scene": "knowledge-gaps",
                "route": "#/knowledge-gaps",
                "question": "查看当前系统自动发现了哪些知识缺口",
                "expectedOutput": "低证据问题、缺失文档类型、影响范围和补充建议。",
            },
        ]

    def _demo_talking_points(self) -> list[str]:
        return [
            "SuperRAG 不是普通聊天机器人，而是面向软件研发团队的知识交接与需求设计辅助系统。",
            "系统先把企业文档切片入库，再通过多路 RAG 检索找到证据，最后生成结构化软件工程产物。",
            "设计辅助输出功能清单、详细文本用例、模块建议、风险和追踪矩阵，并绑定引用证据。",
            "交接模式输出可执行待办、风险登记、责任边界和信息缺口，适合新人接手或项目答辩。",
            "知识缺口页面说明系统不会无依据编造，证据不足时会提示补充文档或人工复核。",
            "历史产物支持复核状态、人工备注和版本记录，形成可沉淀、可追踪的团队知识资产。",
        ]

    def _resolve_or_create_collection(self, project: str) -> dict[str, Any]:
        project_name = project.strip() or "默认项目"
        existing = self._repository.get_collection_by_name(project_name)
        if existing:
            return existing
        return self._repository.create_collection(project_name, f"{project_name} 的知识库")

    def _resolve_collection(self, project: str, collection_id: str = "") -> dict[str, Any]:
        if collection_id:
            collection = self._repository.get_collection(collection_id)
            if collection:
                return collection

        if project:
            collection = self._repository.get_collection(project)
            if collection:
                return collection
            collection = self._repository.get_collection_by_name(project)
            if collection:
                return collection
            raise ValueError(f"project '{project}' has no imported documents")

        collections = self._repository.list_collections()
        if not collections:
            raise ValueError("no collections available, please import documents first")
        return collections[0]

    def _normalize_document(self, item: dict[str, Any], chunks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        status = str(item.get("status") or "已入库")
        if "仅词法检索" in status:
            status = "已入库（本地混合检索）"
        normalized = {
            "id": item["id"],
            "collectionId": item["collection_id"],
            "collectionName": item.get("collection_name") or item.get("project") or "默认项目",
            "title": item.get("title") or item.get("original_name") or item.get("filename") or "未命名文档",
            "type": item.get("doc_type") or "未分类",
            "project": item.get("project") or item.get("collection_name") or "默认项目",
            "version": item.get("version") or "v1.0",
            "scene": item.get("scene") or "通用",
            "summary": item.get("summary") or "",
            "status": status,
            "originalName": item.get("original_name") or item.get("filename") or "",
            "chunkCount": item.get("chunk_count") or 0,
            "charCount": item.get("char_count") or 0,
            "createdAt": item.get("created_at") or "",
        }
        quality_checks = self._build_document_quality_checks(item, chunks or [])
        normalized["ragInfo"] = self._build_document_rag_info(item, chunks or [])
        normalized["qualityChecks"] = quality_checks
        normalized["qualityStatus"] = self._document_quality_status(quality_checks)
        normalized["qualityIssues"] = [
            check["label"]
            for check in quality_checks
            if check.get("level") in {"warn", "bad"}
        ]
        normalized["referenceStats"] = self._build_document_reference_stats(item)
        return normalized

    def _resolve_source_document(
        self,
        *,
        document_id: str,
        chunk: dict[str, Any] | None,
        source_name: str,
    ) -> dict[str, Any] | None:
        if document_id:
            document = self._repository.get_document(document_id)
            if document:
                return document
        if chunk and chunk.get("document_id"):
            document = self._repository.get_document(chunk["document_id"])
            if document:
                return document
        if source_name:
            return self._repository.find_document_by_source_name(source_name)
        return None

    def _serialize_chunk(self, chunk: dict[str, Any] | None) -> dict[str, Any]:
        if not chunk:
            return {}
        content = chunk.get("content", "") or ""
        metadata = chunk.get("metadata", {}) or {}
        return {
            "id": chunk.get("id", ""),
            "documentId": chunk.get("document_id", ""),
            "position": chunk.get("position", 0),
            "content": content,
            "snippet": re.sub(r"\s+", " ", content).strip()[:320],
            "tokenCount": chunk.get("token_count", 0),
            "charCount": len(content),
            "sourceName": metadata.get("source_name", ""),
            "sourceDocument": metadata.get("source_name", ""),
            "searchable": bool(content.strip()),
            "metadata": metadata,
        }

    def _build_document_rag_info(self, item: dict[str, Any], chunks: list[dict[str, Any]]) -> dict[str, Any]:
        metadata = chunks[0].get("metadata", {}) if chunks else {}
        status = str(item.get("status") or "")
        vector_store = self._settings.vector_store
        vector_index_enabled = vector_store == "weaviate" and "本地" not in status
        lexical_fallback = vector_store != "weaviate" or "本地" in status
        if vector_index_enabled:
            retrieval_method = "向量索引 + 词法融合检索"
        elif vector_store == "local":
            retrieval_method = "本地向量近似 + 词法融合检索"
        else:
            retrieval_method = "词法检索回退"

        return {
            "chunkCount": item.get("chunk_count") or len(chunks),
            "charCount": item.get("char_count") or sum(len(chunk.get("content", "")) for chunk in chunks),
            "retrievalMethod": retrieval_method,
            "vectorStore": vector_store,
            "vectorIndexEnabled": vector_index_enabled,
            "lexicalFallback": lexical_fallback,
            "chunkSize": metadata.get("chunk_size") or self._settings.default_chunk_size,
            "chunkOverlap": metadata.get("chunk_overlap") or self._settings.default_chunk_overlap,
        }

    def _build_document_quality_checks(self, item: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, str]]:
        summary = str(item.get("summary") or "").strip()
        doc_type = str(item.get("doc_type") or "").strip()
        scene = str(item.get("scene") or "").strip()
        chunk_count = int(item.get("chunk_count") or len(chunks) or 0)
        char_count = int(item.get("char_count") or sum(len(chunk.get("content", "")) for chunk in chunks) or 0)
        status = str(item.get("status") or "")
        joined_preview = "\n".join(chunk.get("content", "") for chunk in chunks[:5])
        has_rule_context = bool(re.search(r"规则|异常|状态|权限|流程|约束|校验|负责人|审批|删除|金额", joined_preview))

        checks: list[dict[str, str]] = [
            self._quality_check(
                label="文档摘要",
                passed=bool(summary),
                warn_message="缺少摘要，答辩时难以说明文档用途。",
                ok_message="已填写摘要，可帮助快速理解文档价值。",
            ),
            self._quality_check(
                label="文档类型",
                passed=bool(doc_type and doc_type != "未分类"),
                warn_message="缺少文档类型，后续场景检索不易定向。",
                ok_message="已标注文档类型。",
            ),
            self._quality_check(
                label="适用场景",
                passed=bool(scene and scene != "通用"),
                warn_message="适用场景较泛，建议标注培训、交接、设计或问答。",
                ok_message="已标注适用场景。",
            ),
            self._quality_check(
                label="内容长度",
                passed=char_count >= 800,
                warn_message="内容偏短，可能只能支撑少量检索结论。",
                ok_message="内容长度适合 RAG 检索。",
                bad=char_count < 200,
            ),
            self._quality_check(
                label="Chunk 数量",
                passed=chunk_count >= 2,
                warn_message="切片数量偏少，建议补充更多业务背景或规则内容。",
                ok_message="已完成文档切块，可用于检索。",
                bad=chunk_count == 0,
            ),
            self._quality_check(
                label="入库状态",
                passed="失败" not in status and "异常" not in status,
                warn_message="入库状态异常，请重新上传或检查解析日志。",
                ok_message="文档已进入可检索状态。",
                bad="失败" in status or "异常" in status,
            ),
            self._quality_check(
                label="业务规则覆盖",
                passed=has_rule_context or not chunks,
                warn_message="当前预览片段中业务规则、异常流程或权限约束较少，设计辅助效果可能受限。",
                ok_message="片段中包含业务规则、流程或约束信息。",
            ),
        ]
        return checks

    def _quality_check(
        self,
        *,
        label: str,
        passed: bool,
        warn_message: str,
        ok_message: str,
        bad: bool = False,
    ) -> dict[str, str]:
        if passed:
            return {"label": label, "level": "ok", "message": ok_message}
        return {"label": label, "level": "bad" if bad else "warn", "message": warn_message}

    def _document_quality_status(self, checks: list[dict[str, str]]) -> dict[str, str]:
        if any(check.get("level") == "bad" for check in checks):
            return {"label": "需补充后再检索", "level": "bad"}
        if any(check.get("level") == "warn" for check in checks):
            return {"label": "可检索但需完善", "level": "warn"}
        return {"label": "适合检索", "level": "ok"}

    def _build_document_reference_stats(self, item: dict[str, Any]) -> dict[str, Any]:
        document_id = str(item.get("id") or "")
        title_candidates = {
            str(item.get("title") or "").strip(),
            str(item.get("original_name") or "").strip(),
            str(item.get("filename") or "").strip(),
        }
        title_candidates.discard("")
        total = 0
        scene_counts = {"general": 0, "training": 0, "handover": 0, "design": 0}
        last_referenced_at = ""

        for artifact in self._repository.list_artifacts():
            scene = self._normalize_scene(artifact.get("scene") or "general")
            matched_count = 0
            for citation in artifact.get("citations", []):
                citation_document_id = str(citation.get("documentId") or citation.get("document_id") or "")
                citation_title = str(citation.get("documentTitle") or citation.get("title") or "").strip()
                if citation_document_id == document_id or citation_title in title_candidates:
                    matched_count += 1
            if not matched_count:
                continue
            total += matched_count
            scene_counts[scene] = scene_counts.get(scene, 0) + matched_count
            created_at = str(artifact.get("created_at") or "")
            if created_at > last_referenced_at:
                last_referenced_at = created_at

        return {
            "total": total,
            "general": scene_counts.get("general", 0),
            "training": scene_counts.get("training", 0),
            "handover": scene_counts.get("handover", 0),
            "design": scene_counts.get("design", 0),
            "lastReferencedAt": last_referenced_at,
            "note": "引用统计来自后端历史产物 ArtifactRecord。",
        }

    def _serialize_artifact(self, artifact: dict[str, Any]) -> dict[str, Any]:
        scene = self._normalize_scene(artifact.get("scene") or "general")
        artifact_id = artifact.get("id") or ""
        version_records = artifact.get("version_records")
        if version_records is None and artifact_id:
            version_records = self._repository.list_artifact_versions(artifact_id)
        return {
            "id": artifact_id,
            "artifactId": artifact_id,
            "scene": scene,
            "sceneMode": scene if scene != "general" else "chat",
            "artifactType": artifact.get("artifact_type") or scene,
            "title": artifact.get("title") or "未命名历史产物",
            "query": artifact.get("query") or "",
            "originalQuestion": artifact.get("query") or "",
            "project": artifact.get("project") or "",
            "summary": artifact.get("output_summary") or "",
            "outputSummary": artifact.get("output_summary") or "",
            "structuredOutput": artifact.get("structured_output") or {},
            "citations": artifact.get("citations") or [],
            "citationCount": len(artifact.get("citations") or []),
            "qualityAssessment": artifact.get("quality_assessment") or {},
            "reviewStatus": artifact.get("review_status") or "草稿",
            "humanNotes": artifact.get("human_notes") or "",
            "creator": artifact.get("creator") or "course-demo-user",
            "createdAt": artifact.get("created_at") or "",
            "updatedAt": artifact.get("updated_at") or "",
            "versionRecords": [
                self._serialize_artifact_version(item)
                for item in self._as_list(version_records)
                if isinstance(item, dict)
            ],
        }

    def _serialize_artifact_version(self, version: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": version.get("id") or "",
            "artifactId": version.get("artifact_id") or version.get("artifactId") or "",
            "version": version.get("version") or "",
            "time": version.get("created_at") or version.get("createdAt") or "",
            "operator": version.get("operator") or "course-demo-user",
            "change": version.get("change_summary") or version.get("changeSummary") or "保存产物版本快照",
            "snapshot": version.get("snapshot") or {},
        }

    def _artifact_version_snapshot(self, artifact: dict[str, Any]) -> dict[str, Any]:
        return {
            "title": artifact.get("title") or "未命名历史产物",
            "scene": self._normalize_scene(artifact.get("scene") or "general"),
            "artifactType": artifact.get("artifact_type") or artifact.get("artifactType") or "",
            "project": artifact.get("project") or "",
            "query": artifact.get("query") or "",
            "outputSummary": artifact.get("output_summary") or artifact.get("outputSummary") or "",
            "reviewStatus": artifact.get("review_status") or artifact.get("reviewStatus") or "草稿",
            "humanNotes": artifact.get("human_notes") or artifact.get("humanNotes") or "",
            "structuredOutput": artifact.get("structured_output") or artifact.get("structuredOutput") or {},
            "qualityAssessment": artifact.get("quality_assessment") or artifact.get("qualityAssessment") or {},
            "citationCount": len(artifact.get("citations") or []),
        }

    def _normalize_citation(
        self,
        raw: Any,
        *,
        scene: str,
        artifact_id: str,
        artifact_type: str,
        created_at: str,
    ) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raw = {"id": str(raw), "chunkId": str(raw)}
        chunk_id = str(raw.get("chunkId") or raw.get("chunk_id") or raw.get("segmentId") or raw.get("segment_id") or raw.get("id") or "")
        chunk = self._repository.get_chunk(chunk_id) if chunk_id else None
        document_id = str(raw.get("documentId") or raw.get("document_id") or (chunk or {}).get("document_id") or "")
        document = self._repository.get_document(document_id) if document_id else None
        document_title = (
            raw.get("documentTitle")
            or raw.get("document_title")
            or raw.get("title")
            or raw.get("sourceName")
            or raw.get("source_name")
            or (document or {}).get("title")
            or (document or {}).get("original_name")
            or "知识库片段"
        )
        if not document and document_title:
            document = self._repository.find_document_by_source_name(str(document_title))
            if document:
                document_id = document["id"]
                document_title = document.get("title") or document.get("original_name") or document_title
        chunk_index = raw.get("chunkIndex") or raw.get("chunk_index")
        if chunk_index is None:
            chunk_index = int((chunk or {}).get("position", raw.get("position", 0)) or 0) + 1
        score = float(raw.get("score") or raw.get("relevanceScore") or raw.get("relevance_score") or 0)
        return {
            "id": raw.get("id") or chunk_id,
            "documentId": document_id,
            "documentTitle": str(document_title),
            "chunkId": chunk_id,
            "chunkIndex": chunk_index,
            "snippet": str(raw.get("snippet") or raw.get("content") or (chunk or {}).get("content") or "")[:500],
            "score": score,
            "relevanceScore": score,
            "vectorScore": float(raw.get("vectorScore") or raw.get("vector_score") or 0),
            "lexicalScore": float(raw.get("lexicalScore") or raw.get("lexical_score") or 0),
            "scene": scene,
            "artifactId": artifact_id,
            "artifactType": artifact_type,
            "createdAt": created_at,
            "sourceName": raw.get("sourceName") or raw.get("source_name") or str(document_title),
            "segmentId": raw.get("segmentId") or raw.get("segment_id") or chunk_id,
        }

    def _normalize_scene(self, scene: Any) -> str:
        value = str(scene or "").strip()
        mapping = {
            "chat": "general",
            "qa": "general",
            "general": "general",
            "training": "training",
            "handover": "handover",
            "design": "design",
            "design-assistant": "design",
        }
        return mapping.get(value, value or "general")

    def _build_scene_quality_assessment(
        self,
        scene: str,
        structured: dict[str, Any],
        citations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        scene = self._normalize_scene(scene)
        citation_count = len(citations or [])
        if scene == "design":
            categories = [
                self._quality_category("功能清单证据覆盖率", structured.get("functionList"), "sourceDocument"),
                self._quality_category("文本用例证据覆盖率", structured.get("useCases"), "sourceDocument"),
                self._quality_category("模块建议证据覆盖率", structured.get("moduleSuggestions"), "sourceDocument"),
                self._quality_category("风险分析证据覆盖率", structured.get("risks"), "sourceDocument"),
                self._quality_category("追踪矩阵完整度", structured.get("traceabilityMatrix"), "sourceDocument"),
            ]
            gaps = self._as_list(structured.get("openQuestions"))
            coverage = structured.get("evidenceCoverage") if isinstance(structured.get("evidenceCoverage"), dict) else {}
            missing_aspects = self._as_list(coverage.get("missingAspects"))
        elif scene == "handover":
            categories = [
                self._quality_text_category("进度结论证据充分度", structured.get("currentProgress"), citation_count),
                self._quality_category("待办事项证据充分度", structured.get("todoList"), "evidenceSource"),
                self._quality_category("风险登记证据充分度", structured.get("riskRegister"), "sourceDocument"),
                self._quality_category("责任边界证据充分度", structured.get("responsibilityBoundary"), "sourceDocument"),
                self._quality_list_category("依赖文档完整度", structured.get("dependentDocuments")),
            ]
            gaps = self._as_list(structured.get("informationGaps"))
            missing_aspects = []
        else:
            categories = [self._quality_text_category("回答证据充分度", structured.get("summary") or structured.get("answer"), citation_count)]
            gaps = self._as_list(structured.get("openQuestions") or structured.get("informationGaps"))
            missing_aspects = []

        total_checked = sum(item["total"] for item in categories)
        evidence_bound = sum(item["evidenceBound"] for item in categories)
        avg_score = round(sum(item["score"] for item in categories) / len(categories), 2) if categories else 0
        low_evidence_items = sum(item["lowEvidenceItems"] for item in categories)
        uncited_items = max(0, total_checked - evidence_bound)
        can_enter_review = avg_score >= 0.7 and not gaps and uncited_items == 0
        return {
            "scene": scene,
            "score": avg_score,
            "level": self._quality_level(avg_score, gaps, uncited_items),
            "categoryScores": categories,
            "totalCheckedItems": total_checked,
            "evidenceBoundItems": evidence_bound,
            "lowEvidenceItems": low_evidence_items,
            "uncitedItems": uncited_items,
            "openIssueCount": len(gaps) + len(missing_aspects),
            "missingAspects": missing_aspects,
            "gaps": gaps,
            "canEnterReview": can_enter_review,
            "reviewSuggestion": "可进入人工评审。" if can_enter_review else "仍存在低证据项或知识缺口，建议补充文档后再评审。",
        }

    def _quality_category(self, label: str, items: Any, source_key: str) -> dict[str, Any]:
        normalized_items = [item for item in self._as_list(items) if isinstance(item, dict)]
        total = len(normalized_items)
        if not total:
            return {"label": label, "score": 0, "total": 0, "evidenceBound": 0, "lowEvidenceItems": 0, "status": "missing"}
        evidence_bound = sum(1 for item in normalized_items if self._item_has_evidence(item, source_key))
        low_evidence = sum(1 for item in normalized_items if float(item.get("evidenceScore") or item.get("score") or 0) < 0.2 and not item.get("evidenceSnippet"))
        score = round(evidence_bound / total, 2)
        return {
            "label": label,
            "score": score,
            "total": total,
            "evidenceBound": evidence_bound,
            "lowEvidenceItems": low_evidence,
            "status": self._quality_level(score, [], total - evidence_bound),
        }

    def _quality_text_category(self, label: str, text: Any, citation_count: int) -> dict[str, Any]:
        exists = bool(str(text or "").strip())
        score = 1 if exists and citation_count else (0.5 if exists else 0)
        return {
            "label": label,
            "score": score,
            "total": 1 if exists else 0,
            "evidenceBound": 1 if exists and citation_count else 0,
            "lowEvidenceItems": 0 if citation_count else 1,
            "status": self._quality_level(score, [], 0 if citation_count else 1),
        }

    def _quality_list_category(self, label: str, items: Any) -> dict[str, Any]:
        count = len(self._as_list(items))
        score = 1 if count >= 2 else (0.5 if count else 0)
        return {
            "label": label,
            "score": score,
            "total": count,
            "evidenceBound": count,
            "lowEvidenceItems": 0 if count else 1,
            "status": self._quality_level(score, [], 0 if count else 1),
        }

    def _item_has_evidence(self, item: dict[str, Any], source_key: str) -> bool:
        source = str(item.get(source_key) or item.get("sourceDocument") or item.get("evidenceSource") or "").strip()
        snippet = str(item.get("evidenceSnippet") or item.get("snippet") or "").strip()
        return bool(snippet or (source and source not in {"待关联文档", "待确认文档", "待关联"}))

    def _quality_level(self, score: float, gaps: list[Any], uncited_items: int) -> str:
        if gaps or uncited_items > 2 or score < 0.4:
            return "low"
        if uncited_items or score < 0.75:
            return "partial"
        return "high"

    def _extract_artifact_gap_items(
        self,
        *,
        artifact: dict[str, Any],
        structured: dict[str, Any],
        quality: dict[str, Any],
    ) -> list[dict[str, Any]]:
        scene = self._normalize_scene(artifact.get("scene") or "general")
        gaps: list[dict[str, Any]] = []

        for item in self._as_list(structured.get("openQuestions")):
            gaps.append(self._gap_item("待确认问题", item, scene, "设计结论或用例评审", "补充需求说明、业务规则或接口文档", "high"))
        for item in self._as_list(structured.get("informationGaps")):
            gaps.append(self._gap_item("信息缺口", item, scene, "项目交接完整性", "补充交接记录、负责人、测试或部署说明", "high"))
        coverage = structured.get("evidenceCoverage") if isinstance(structured.get("evidenceCoverage"), dict) else {}
        for item in self._as_list(coverage.get("missingAspects")):
            gaps.append(self._gap_item("证据覆盖缺失", item, scene, "需求设计评审", "补充可引用的需求、接口或异常流程材料", "medium"))
        for item in self._as_list(quality.get("missingAspects")):
            gaps.append(self._gap_item("质量评估缺失", item, scene, "产物质量评估", "补充对应证据文档并重新生成", "medium"))
        for risk in self._as_list(structured.get("risks") or structured.get("riskRegister")):
            if isinstance(risk, dict) and bool(risk.get("needsReview") or risk.get("needs_review")):
                description = risk.get("description") or risk.get("risk") or "风险项需要人工复核"
                gaps.append(
                    self._gap_item(
                        "需人工复核风险",
                        description,
                        scene,
                        risk.get("impact") or "风险评估和交付决策",
                        risk.get("suggestion") or "补充证据并由负责人复核",
                        "medium",
                        related_document=risk.get("sourceDocument") or risk.get("evidenceSource") or "",
                    )
                )
        uncited_count = int(quality.get("uncitedItems") or 0)
        if uncited_count:
            gaps.append(
                self._gap_item(
                    "未绑定证据项",
                    f"存在 {uncited_count} 个结构化条目缺少明确证据绑定",
                    scene,
                    "产物可信度和答辩说服力",
                    "补充引用文档或降低该产物的评审状态",
                    "high" if uncited_count >= 3 else "medium",
                )
            )
        return gaps

    def _gap_item(
        self,
        gap_type: str,
        description: Any,
        scene: str,
        impact_scope: Any,
        suggestion: Any,
        severity: str,
        *,
        related_document: str = "",
    ) -> dict[str, Any]:
        text = str(description or "").strip()
        return {
            "gapType": gap_type,
            "description": text,
            "sourceScene": scene,
            "impactScope": str(impact_scope or "待确认影响范围"),
            "suggestion": str(suggestion or "补充相关文档"),
            "severity": severity,
            "relatedDocument": related_document,
        }

    def _gap_key(self, gap: dict[str, Any]) -> str:
        text = re.sub(r"\s+", " ", str(gap.get("description") or "")).strip().lower()
        text = re.sub(r"[，。；、,.!?！？:：]+", " ", text)
        return f"{gap.get('gapType', 'gap')}:{text[:48] or 'unknown'}"

    def _higher_severity(self, left: str, right: str) -> str:
        return left if self._severity_rank(left) >= self._severity_rank(right) else right

    def _severity_rank(self, severity: str) -> int:
        return {"low": 1, "medium": 2, "high": 3}.get(str(severity or "").lower(), 1)

    def _build_document_ingestion_logs(self, document: dict[str, Any]) -> list[dict[str, str]]:
        status = document.get("status") or "已入库"
        rag_info = document.get("ragInfo") or {}
        return [
            {
                "time": document.get("createdAt") or "最近",
                "status": status,
                "message": f"文档已解析为 {rag_info.get('chunkCount', 0)} 个知识片段，字符数约 {rag_info.get('charCount', 0)}。",
            },
            {
                "time": "当前",
                "status": status,
                "message": f"检索方式：{rag_info.get('retrievalMethod', '本地检索')}；chunk_size={rag_info.get('chunkSize', '-')}, overlap={rag_info.get('chunkOverlap', '-')}。",
            },
        ]

    def _infer_document_category(self, document: dict[str, Any]) -> str:
        scene = str(document.get("scene") or "")
        doc_type = str(document.get("type") or "")
        if "交接" in scene or "交接" in doc_type:
            return "项目交接知识 / 风险待办"
        if "培训" in scene or "培训" in doc_type:
            return "新人培训知识 / 学习路径"
        if "接口" in doc_type:
            return "接口与依赖知识 / 设计辅助"
        if "需求" in doc_type or "设计" in scene:
            return "需求设计知识 / 业务规则"
        return document.get("collectionName") or "通用项目知识 / 待细分"

    def _read_document_content(self, document: dict[str, Any], chunks: list[dict[str, Any]]) -> str:
        filename = document.get("filename") or ""
        if filename:
            target_path = (self._settings.uploads_dir / filename).resolve()
            try:
                if target_path.is_file() and self._settings.uploads_dir.resolve() in target_path.parents:
                    return load_document(Path(target_path))
            except Exception:
                pass
        return "\n\n".join(chunk.get("content", "") for chunk in chunks if chunk.get("content"))

    def _scene_label(self, scene: str) -> str:
        return {
            "general": "通用检索",
            "training": "培训模式",
            "handover": "交接模式",
            "design": "设计辅助",
        }.get(scene, scene)

    def _payload_text(self, payload: dict[str, Any], key: str, default: str = "") -> str:
        value = payload.get(key)
        if value is None:
            return default
        if isinstance(value, (list, tuple, set)):
            text = "、".join(str(item).strip() for item in value if str(item).strip())
            return text or default
        if isinstance(value, dict):
            return json.dumps(value, ensure_ascii=False)
        text = str(value).strip()
        return text or default

    def _build_system_prompt(self, scene: str, payload: dict[str, Any]) -> str:
        if scene == "design":
            return self._build_design_prompt(payload)

        focus = self._payload_text(payload, "focus")
        role = self._payload_text(payload, "role")
        module = self._payload_text(payload, "module")
        instructions = {
            "general": "请用中文给出简洁结论，并明确引用到的关键信息。",
            "training": "请用中文回答，适合培训新人，先讲背景，再讲关键概念，最后给出学习建议。",
            "handover": "请用中文回答，强调当前进度、风险、待办和责任边界，适合项目交接。",
            "design": "请用中文回答，强调功能清单、文本用例、模块边界和设计风险。",
        }
        extra = " ".join(part for part in [f"对象：{role}" if role else "", f"模块：{module}" if module else "", f"重点：{focus}" if focus else ""] if part)
        return (
            "你是一个面向软件工程知识库的中文助手。"
            "请尽量只根据提供的检索上下文作答，信息不足时要明确说明。"
            f"{instructions.get(scene, instructions['general'])}"
            f"{extra}"
        )

    def _build_design_prompt(self, payload: dict[str, Any], evidence_context: dict[str, Any] | None = None) -> str:
        output_type = self._payload_text(payload, "module")
        focus = self._payload_text(payload, "focus")
        scope = self._estimate_design_scope(payload=payload, evidence_context=evidence_context or {})
        return (
            "你是面向软件研发团队的需求设计分析师。请基于 retrievalContext.groups 中的检索证据，按软件工程分析流程生成结构化设计产物。"
            "工作流程："
            "1. 从检索上下文识别业务对象、业务角色、业务流程和业务规则。"
            "2. 抽取功能需求，不允许编造文档中没有依据的功能。"
            "3. 为核心功能生成详细文本用例。"
            "4. 根据功能边界提出模块划分。"
            "5. 分析权限、状态流转、数据一致性、异常流程和删除约束等设计风险。"
            "6. 对每个功能、用例、风险、模块建议绑定 sourceDocument、evidenceSnippet、evidenceScore。"
            "7. 对证据不足的信息输出到 openQuestions，不允许强行补全。"
            "8. 输出必须是严格 JSON，不要 Markdown，不要解释文字。"
            "禁止把硬件配置、部署参数、日志路径、Docker、向量维度、chunk、Top-K、Reranker、LLM 等技术配置当成功能。"
            "工业级输出要求：先把检索片段中的标题、小节、列表、规则句子拆解为细粒度需求项，再生成完整设计产物。"
            "输出数量必须由证据复杂度决定：简单文档可以少，复杂文档必须充分展开，禁止为了凑数量编造。"
            "如果检索上下文包含多个模块、小节、业务动作或规则句，应逐项展开；如果证据不足，把缺失事实写入 openQuestions。"
            f"当前证据复杂度估算：{scope['level']}；建议规模：functionList 约 {scope['functions']} 项、useCases 约 {scope['use_cases']} 项、"
            f"moduleSuggestions 约 {scope['modules']} 项、businessRules 约 {scope['rules']} 条、risks 约 {scope['risks']} 项。"
            "JSON 顶层字段必须包含：source、businessObjects、businessRules、functionList、useCases、moduleSuggestions、dataObjects、permissionAnalysis、exceptionScenarios、risks、openQuestions、traceabilityMatrix、evidenceCoverage、nextActions、diagram。"
            "functionList 每项必须包含 id、name、description、priority、sourceDocument、evidenceSnippet、evidenceScore。"
            "useCases 每项必须包含 id、name、goal、trigger、actor、preconditions、mainSuccessScenario、extensionScenarios、exceptionScenarios、businessRules、dataFields、acceptanceCriteria、postconditions、sourceDocument、evidenceSnippet、evidenceScore。"
            "moduleSuggestions 每项必须包含 name、responsibility、input、output、dependencies、sourceDocument。"
            "dataObjects 每项必须包含 name、fields、relatedModules、sourceDocument。"
            "risks 每项必须包含 description、impact、suggestion、needsReview、sourceDocument、evidenceSnippet。"
            "traceabilityMatrix 每项必须包含 requirementSource、functionName、useCaseName、moduleName、evidenceSnippet、sourceDocument。"
            "evidenceCoverage 必须包含 coveredAspects、missingAspects、coverageLevel、reviewSuggestion。"
            "diagram 必须是 Mermaid flowchart TD 源码字符串，节点 id 使用 ASCII 字母数字下划线。"
            f"用户期望产物类型：{output_type or '设计输出'}。输出粒度：{focus or '标准'}。"
        )

    def _build_handover_prompt(self, payload: dict[str, Any]) -> str:
        focus = self._payload_text(payload, "focus")
        role = self._payload_text(payload, "role")
        return (
            "你是软件项目交接分析师。请基于 retrievalContext.groups 中的检索证据生成可执行交接清单，而不是普通摘要。"
            "必须遵守："
            "1. 只根据检索上下文作答。"
            "2. 不允许编造负责人、进度、测试状态、部署状态。"
            "3. 如果文档没有说明，必须进入 informationGaps。"
            "4. 每个风险、待办和关键结论都要尽量绑定 evidenceSnippet、sourceDocument 或 evidenceSource。"
            "5. 输出必须是严格 JSON，不要 Markdown，不要解释文字。"
            "JSON 顶层字段必须包含：source、projectBackground、currentProgress、completedItems、unfinishedItems、riskRegister、todoList、responsibilityBoundary、dependentDocuments、informationGaps、handoverChecklist、evidenceMap。"
            "riskRegister 每项必须包含 risk、impact、suggestion、evidenceSnippet、sourceDocument。"
            "todoList 每项必须包含 taskName、priority、riskLevel、suggestedOwner、dependentDocument、evidenceSource、status。"
            "evidenceMap 每项必须包含 conclusion、sourceDocument、evidenceSnippet、score。"
            f"交接范围：{focus or '当前项目'}。接手角色：{role or '项目成员'}。"
        )

    def _parse_design_json(self, value: str) -> dict[str, Any] | None:
        text = value.strip()
        if not text:
            return None

        fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
        if fence_match:
            text = fence_match.group(1)
        else:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                text = text[start : end + 1]

        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            return None

        if not isinstance(payload, dict):
            return None

        result = {
            "functionList": payload.get("functionList") or payload.get("function_list") or [],
            "useCases": payload.get("useCases") or payload.get("use_cases") or [],
            "moduleSuggestions": payload.get("moduleSuggestions") or payload.get("module_suggestions") or [],
            "risks": payload.get("risks") or [],
            "nextActions": payload.get("nextActions") or payload.get("next_actions") or [],
            "diagram": (payload.get("diagram") or payload.get("mermaid") or "").strip(),
        }
        if not result["diagram"]:
            result["diagram"] = self._build_design_diagram(result)
        return result

    def _retrieve_scene_evidence(
        self,
        *,
        scene: str,
        collection_id: str,
        query: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        query_items = self._build_scene_queries(scene=scene, query=query, payload=payload)
        retrieval = self._retrieval_service.retrieve_many(
            collection_id=collection_id,
            queries=[item["query"] for item in query_items],
            top_k=max(18, self._settings.max_context_chunks * 3),
        )
        raw_hits = retrieval.get("hits", [])
        hits = [self._serialize_scene_hit(hit) for hit in raw_hits]
        groups = self._group_hits_by_query(query_items=query_items, hits=raw_hits)
        return {
            "queries": query_items,
            "raw_hits": raw_hits,
            "hits": hits,
            "groups": groups,
            "warning": retrieval.get("warning", ""),
        }

    def _build_scene_queries(self, *, scene: str, query: str, payload: dict[str, Any]) -> list[dict[str, str]]:
        project = self._payload_text(payload, "project")
        focus = self._payload_text(payload, "focus")
        module = self._payload_text(payload, "module")
        prefix = " ".join(part for part in [project, module, focus] if part)
        if scene == "design":
            topics = [
                ("original", query),
                ("business_objects_roles", "核心业务对象和业务角色"),
                ("functions_flows", "主要功能和操作流程"),
                ("rules_states", "业务规则和状态流转"),
                ("permissions_owners", "权限、负责人和团队成员规则"),
                ("exceptions_limits", "异常情况和限制条件"),
                ("cross_module_consistency", "跨模块关联和数据一致性"),
            ]
        else:
            topics = [
                ("original", query),
                ("background_goal", "项目背景和目标"),
                ("progress_completed", "当前进度和已完成事项"),
                ("unfinished_todos", "未完成事项和待办任务"),
                ("risks_blockers", "风险、阻塞点和异常情况"),
                ("responsibility", "负责人、角色和责任边界"),
                ("dependent_documents", "依赖文档和交接材料"),
            ]

        queries = []
        seen: set[str] = set()
        for name, topic in topics:
            text = topic if name == "original" else f"{prefix} {topic}".strip()
            if not text or text in seen:
                continue
            seen.add(text)
            queries.append({"name": name, "query": text})
        return queries

    def _group_hits_by_query(
        self,
        *,
        query_items: list[dict[str, str]],
        hits: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        groups = []
        for query_item in query_items:
            query_text = query_item["query"]
            matched = [
                self._serialize_scene_hit(hit)
                for hit in hits
                if query_text in hit.get("matched_queries", [])
            ][:6]
            groups.append(
                {
                    "name": query_item["name"],
                    "query": query_text,
                    "hits": matched,
                }
            )
        return groups

    def _serialize_scene_hit(self, hit: dict[str, Any]) -> dict[str, Any]:
        metadata = hit.get("metadata", {})
        source = metadata.get("source_name") or metadata.get("title") or "知识库片段"
        snippet = str(hit.get("content") or "").strip()
        return {
            "id": hit.get("id", ""),
            "chunkId": hit.get("id", ""),
            "documentId": hit.get("document_id", ""),
            "sourceDocument": source,
            "sourceName": source,
            "snippet": snippet[:1400],
            "score": float(hit.get("score") or 0),
            "vectorScore": float(hit.get("vector_score") or 0),
            "lexicalScore": float(hit.get("lexical_score") or 0),
            "position": int(hit.get("position", 0) or 0),
            "matchedQueries": hit.get("matched_queries", []),
        }

    def _top_scene_hits(self, evidence_context: dict[str, Any], limit: int = 6) -> list[dict[str, Any]]:
        return [
            item
            for item in evidence_context.get("hits", [])
            if str(item.get("snippet") or "").strip()
        ][:limit]

    def _estimate_design_scope(self, *, payload: dict[str, Any], evidence_context: dict[str, Any]) -> dict[str, Any]:
        hits = self._top_scene_hits(evidence_context, limit=18)
        feature_candidates = self._extract_design_feature_candidates(hits, limit=36)
        rule_candidates = self._extract_rule_candidates(hits, limit=20)
        source_count = len({self._hit_source(hit) for hit in hits if self._hit_source(hit)})
        object_count = len(self._extract_business_terms(hits))
        module_count = min(6, max(0, source_count or object_count))
        feature_count = len(feature_candidates)
        rule_count = len(rule_candidates)
        signal_score = feature_count + rule_count + object_count + source_count
        if signal_score >= 18:
            level = "复杂"
        elif signal_score >= 9:
            level = "中等"
        elif signal_score > 0:
            level = "简单"
        else:
            level = "证据不足"

        focus = self._payload_text(payload, "focus")
        use_case_count = feature_count
        if "简要" in focus:
            use_case_count = min(feature_count, max(1, round(feature_count * 0.6))) if feature_count else 0

        return {
            "level": level,
            "functions": feature_count,
            "use_cases": use_case_count,
            "modules": module_count if feature_count else 0,
            "rules": rule_count,
            "risks": min(feature_count, max(rule_count, self._count_exception_signals(hits))) if feature_count else 0,
            "next_actions": min(feature_count, 8),
            "traceability": feature_count,
        }

    def _hit_source(self, hit: dict[str, Any] | None) -> str:
        if not hit:
            return "当前知识库"
        return str(hit.get("sourceDocument") or hit.get("sourceName") or "当前知识库")

    def _hit_snippet(self, hit: dict[str, Any] | None, length: int = 180) -> str:
        if not hit:
            return ""
        snippet = str(hit.get("snippet") or "").strip().replace("\n", " ")
        return snippet[:length]

    def _hit_raw_text(self, hit: dict[str, Any] | None, length: int = 1400) -> str:
        if not hit:
            return ""
        return str(hit.get("snippet") or "").strip()[:length]

    def _hit_score(self, hit: dict[str, Any] | None) -> float:
        if not hit:
            return 0.0
        raw_score = float(hit.get("score") or 0)
        return round(min(1.0, max(0.0, raw_score)), 4)

    def _sentence_from_hit(self, hit: dict[str, Any] | None, fallback: str) -> str:
        snippet = self._hit_snippet(hit, 120)
        if not snippet:
            return fallback
        parts = re.split(r"[。；;.!?\n]", snippet)
        for part in parts:
            cleaned = part.strip()
            if len(cleaned) >= 8:
                return cleaned[:90]
        return snippet[:90]

    def _build_design_fallback(
        self,
        *,
        query: str,
        payload: dict[str, Any],
        evidence_context: dict[str, Any],
    ) -> dict[str, Any]:
        scope = self._estimate_design_scope(payload=payload, evidence_context=evidence_context)
        hits = self._top_scene_hits(evidence_context, limit=18)
        objects = self._extract_business_terms(hits)
        feature_candidates = self._extract_design_feature_candidates(hits, limit=max(1, scope["functions"]))
        functions = []
        use_cases = []
        modules = []
        data_objects = []
        risks = []
        traceability = []
        next_actions = []
        module_name = self._payload_text(payload, "module", "需求设计")

        for index, candidate in enumerate(feature_candidates, start=1):
            hit = candidate.get("hit") or (hits[(index - 1) % len(hits)] if hits else {})
            source = str(candidate.get("sourceDocument") or self._hit_source(hit))
            snippet = str(candidate.get("evidenceSnippet") or self._hit_snippet(hit))
            function_name = str(candidate.get("name") or self._derive_function_name(hit, index))
            use_case_name = f"{function_name}文本用例"
            module_label = self._derive_module_name(hit, index, module_name)
            functions.append(
                {
                    "id": f"F-{index:03d}",
                    "name": function_name,
                    "description": candidate.get("description")
                    or self._sentence_from_hit(hit, f"基于 {source} 抽取的功能候选，需要人工确认边界。"),
                    "priority": "high" if index <= 2 else "medium",
                    "sourceDocument": source,
                    "relatedDocument": source,
                    "evidenceSnippet": snippet,
                    "evidenceScore": candidate.get("evidenceScore") or self._hit_score(hit),
                }
            )
            use_cases.append(
                self._build_professional_use_case(
                    index=index,
                    function_name=function_name,
                    module_label=module_label,
                    hit=hit,
                    source=source,
                    snippet=snippet,
                )
            )
            modules.append(
                {
                    "name": module_label,
                    "responsibility": f"承载 {function_name} 相关业务流程、规则校验和证据追踪。",
                    "input": ["业务请求", "角色权限", "已入库需求证据"],
                    "output": ["功能处理结果", "操作记录", "引用证据"],
                    "dependencies": [source],
                    "sourceDocument": source,
                }
            )
            object_candidate = objects[(index - 1) % len(objects)] if objects else f"业务对象{index}"
            object_name = object_candidate.get("name", "业务对象") if isinstance(object_candidate, dict) else str(object_candidate)
            data_objects.append(
                {
                    "name": object_name,
                    "fields": self._infer_fields(hit),
                    "relatedModules": [module_label],
                    "sourceDocument": source,
                }
            )
            traceability.append(
                {
                    "requirementSource": source,
                    "functionName": function_name,
                    "useCaseName": use_case_name,
                    "moduleName": module_label,
                    "evidenceSnippet": snippet,
                    "sourceDocument": source,
                }
            )
            next_actions.append(
                {
                    "action": f"人工复核 {function_name} 的业务规则和异常流程",
                    "priority": "high" if index <= 2 else "medium",
                    "owner": "产品/研发",
                    "dependentDocument": source,
                    "doneDefinition": "确认功能边界、输入输出、权限规则和异常处理均有文档依据。",
                }
            )

        if not hits:
            risks.append(
                {
                    "description": "当前知识库没有检索到可支撑设计产物的片段",
                    "impact": "无法可靠生成业务对象、功能清单和详细文本用例。",
                    "suggestion": "先上传需求规格说明、接口文档、用例模板或业务流程说明。",
                    "supplement": "需求规格说明、接口文档、用例模板。",
                    "confidence": "低",
                    "needsReview": True,
                    "sourceDocument": "当前知识库",
                    "evidenceSnippet": "",
                }
            )

        covered = ["功能清单", "文本用例", "模块划分", "风险识别"] if hits else []
        missing = self._infer_missing_design_aspects(evidence_context)
        business_rules = self._extract_rule_candidates(hits, limit=max(6, scope["rules"]))
        exception_scenarios = self._build_exception_scenarios(hits, limit=max(6, scope["risks"]))
        if hits:
            risks = self._build_design_risks(
                hits=hits,
                functions=functions,
                business_rules=business_rules,
                limit=max(6, scope["risks"]),
            )
        return {
            "source": "retrieval-fallback",
            "businessObjects": objects,
            "businessRules": business_rules,
            "functionList": functions,
            "useCases": use_cases,
            "moduleSuggestions": self._dedupe_modules(modules),
            "dataObjects": data_objects[: max(5, scope["modules"])],
            "permissionAnalysis": self._build_permission_analysis(hits),
            "exceptionScenarios": exception_scenarios,
            "risks": risks,
            "openQuestions": self._build_design_open_questions(missing),
            "traceabilityMatrix": traceability,
            "evidenceCoverage": {
                "coveredAspects": covered,
                "missingAspects": missing,
                "coverageLevel": "partial" if hits else "insufficient",
                "reviewSuggestion": "当前为检索兜底结果，建议补齐缺失文档并进行人工复核。",
            },
            "nextActions": next_actions or self._build_next_actions("design", payload),
            "diagram": "",
        }

    def _build_professional_use_case(
        self,
        *,
        index: int,
        function_name: str,
        module_label: str,
        hit: dict[str, Any],
        source: str,
        snippet: str,
    ) -> dict[str, Any]:
        actor = self._infer_actor(hit)
        fields = self._infer_fields(hit)
        rule_texts = self._extract_related_rule_texts(hit, limit=4)
        action_type = self._infer_action_type(function_name)
        object_name = self._infer_business_object(function_name=function_name, hit=hit)
        main_steps = self._build_use_case_main_steps(
            actor=actor,
            function_name=function_name,
            object_name=object_name,
            action_type=action_type,
            fields=fields,
            rules=rule_texts,
            hit=hit,
        )
        exceptions = self._infer_exception_items(hit)
        acceptance = self._build_acceptance_criteria(
            function_name=function_name,
            object_name=object_name,
            action_type=action_type,
            rules=rule_texts,
            exceptions=exceptions,
        )
        goal = self._build_use_case_goal(function_name=function_name, object_name=object_name, action_type=action_type)
        trigger = self._build_use_case_trigger(function_name=function_name, object_name=object_name, action_type=action_type)
        return {
            "id": f"UC-{index:03d}",
            "name": f"{function_name}文本用例",
            "goal": goal,
            "trigger": trigger,
            "actor": actor,
            "scope": module_label,
            "level": "user-goal",
            "preconditions": self._build_use_case_preconditions(
                actor=actor,
                object_name=object_name,
                action_type=action_type,
                source=source,
                fields=fields,
                rules=rule_texts,
            ),
            "mainSuccessScenario": main_steps,
            "extensionScenarios": self._build_use_case_extensions(
                function_name=function_name,
                object_name=object_name,
                action_type=action_type,
                hit=hit,
            ),
            "exceptionScenarios": exceptions,
            "businessRules": rule_texts,
            "dataFields": fields,
            "acceptanceCriteria": acceptance,
            "postconditions": self._build_use_case_postconditions(
                function_name=function_name,
                object_name=object_name,
                action_type=action_type,
            ),
            "sourceDocument": source,
            "evidenceSnippet": snippet,
            "evidenceScore": self._hit_score(hit),
        }

    def _infer_action_type(self, function_name: str) -> str:
        text = str(function_name or "")
        action_keywords = [
            ("新建", "create"),
            ("新增", "create"),
            ("创建", "create"),
            ("录入", "create"),
            ("编辑", "update"),
            ("修改", "update"),
            ("维护", "update"),
            ("删除", "delete"),
            ("移除", "delete"),
            ("查询", "query"),
            ("查找", "query"),
            ("搜索", "query"),
            ("筛选", "query"),
            ("查看", "query"),
            ("转移", "transfer"),
            ("分配", "transfer"),
            ("放入公海", "pool"),
            ("公海", "pool"),
            ("导入", "import"),
            ("导出", "export"),
            ("审核", "approve"),
            ("审批", "approve"),
            ("推进", "state_transition"),
            ("切换", "state_transition"),
            ("跟进", "follow_up"),
            ("生成", "generate"),
            ("关联", "link"),
            ("同步", "sync"),
            ("统计", "analytics"),
            ("看板", "analytics"),
            ("开票", "invoice"),
            ("回款", "payment"),
        ]
        for keyword, action_type in action_keywords:
            if keyword in text:
                return action_type
        return "manage"

    def _infer_business_object(self, *, function_name: str, hit: dict[str, Any]) -> str:
        business_objects = ["回款计划", "团队成员", "跟进记录", "客户任务", "客户场景", "公海池", "联系人", "负责人", "客户", "商机", "合同", "回款", "发票"]
        function_text = str(function_name or "")
        for item in business_objects:
            if item in function_text:
                return item
        snippet = self._hit_snippet(hit, 260)
        for item in business_objects:
            if item in snippet:
                return item
        source_object = self._derive_object_from_source(hit)
        source_object = re.sub(r"^\d+_?CRM", "", source_object).strip("_- ")
        source_object = re.sub(r"模块$", "", source_object)
        return source_object or "业务对象"

    def _extract_related_rule_texts(self, hit: dict[str, Any], limit: int = 4) -> list[str]:
        text = self._hit_raw_text(hit, 1800)
        rules: list[str] = []
        seen: set[str] = set()
        sentence_pattern = re.compile(r"[^。；;\n]{0,24}(?:必须|不能|不允许|需要|应当|支持|校验|唯一|重复|删除|转移|超限|关联|联动|同步|审批|状态|权限|公海|负责人)[^。；;\n]{0,90}")
        for match in sentence_pattern.finditer(text):
            sentence = re.sub(r"\s+", " ", match.group(0)).strip(" -\t")
            if len(sentence) < 8 or sentence in seen:
                continue
            seen.add(sentence)
            rules.append(sentence)
            if len(rules) >= limit:
                return rules
        return rules

    def _build_use_case_goal(self, *, function_name: str, object_name: str, action_type: str) -> str:
        goal_map = {
            "create": f"完成{object_name}的规范化录入，并保证关键字段、唯一性和负责人规则可追溯。",
            "update": f"在权限允许范围内维护{object_name}信息，保证修改后的数据满足字段和状态约束。",
            "delete": f"在确认无关键关联数据或满足删除约束后，安全删除或阻止删除{object_name}。",
            "query": f"通过关键词、场景或高级筛选快速定位{object_name}，支撑后续跟进和交接。",
            "transfer": f"将{object_name}责任边界转移给新的负责人，并处理团队成员权限和关联数据同步。",
            "pool": f"将符合规则的{object_name}放入公海池，并控制原负责人和公海成员的可见范围。",
            "import": f"批量导入{object_name}数据，并处理查重、覆盖、跳过和失败原因反馈。",
            "export": f"按权限和筛选范围导出{object_name}数据，保证导出内容可审计。",
            "approve": f"完成{object_name}审批或审核处理，记录审批结果并驱动后续流程。",
            "state_transition": f"按状态流转条件推进{object_name}阶段，避免跳过必要任务或审批。",
            "follow_up": f"沉淀{object_name}跟进过程信息，并形成后续提醒和交接证据。",
            "link": f"建立{object_name}与上下游业务对象的关联关系，保证跨模块追踪一致。",
            "sync": f"同步{object_name}相关字段和责任信息，避免跨模块数据不一致。",
            "analytics": f"汇总{object_name}数据并形成可解释的统计视图。",
        }
        return goal_map.get(action_type, f"围绕{object_name}完成{function_name}，并输出可追溯的业务处理结果。")

    def _build_use_case_trigger(self, *, function_name: str, object_name: str, action_type: str) -> str:
        trigger_map = {
            "create": f"{object_name}资料需要首次录入或销售人员获得新的业务线索。",
            "update": f"{object_name}资料、负责人、状态或协作信息发生变化。",
            "delete": f"{object_name}记录需要清理，且用户发起删除操作。",
            "query": f"用户需要从列表中定位特定{object_name}或形成常用视图。",
            "transfer": f"负责人调整、团队协作变化或交接场景需要转移{object_name}责任。",
            "pool": f"{object_name}满足公海释放规则，或用户主动执行放入公海操作。",
            "import": f"用户需要将线下整理的数据批量写入系统。",
            "export": f"用户需要将筛选后的业务数据导出用于统计、交接或复核。",
            "approve": f"{object_name}进入需要审批或审核确认的流程节点。",
            "state_transition": f"{object_name}达到下一阶段条件，用户发起阶段推进。",
            "follow_up": f"用户完成沟通、拜访、联系或资料补充后需要记录过程。",
        }
        return trigger_map.get(action_type, f"用户在业务流程中发起{function_name}操作。")

    def _build_use_case_preconditions(
        self,
        *,
        actor: str,
        object_name: str,
        action_type: str,
        source: str,
        fields: list[str],
        rules: list[str],
    ) -> list[str]:
        preconditions = [
            f"{actor}已登录系统，并具备访问{object_name}相关功能的权限。",
            f"《{source}》中的相关需求片段已入库，可作为本用例的证据来源。",
        ]
        if action_type not in {"create", "import"}:
            preconditions.append(f"系统中已存在可操作的{object_name}记录。")
        if fields:
            preconditions.append(f"页面或接口已提供关键字段：{'、'.join(fields[:6])}。")
        if rules:
            preconditions.append(f"业务规则已明确：{rules[0]}")
        return preconditions[:5]

    def _build_use_case_main_steps(
        self,
        *,
        actor: str,
        function_name: str,
        object_name: str,
        action_type: str,
        fields: list[str],
        rules: list[str],
        hit: dict[str, Any],
    ) -> list[str]:
        field_text = "、".join(fields[:6]) if fields else "必要业务字段"
        rule_text = rules[0] if rules else "已入库文档中的字段、权限和流程规则"
        action_steps = {
            "create": [
                f"{actor}进入{object_name}管理页面，点击“{function_name}”并打开录入表单。",
                f"系统展示{field_text}等字段，并按管理员字段配置标记必填、唯一、展示和填写方式。",
                f"{actor}填写或粘贴{object_name}资料；如文档支持 AI 识别，系统自动提取姓名、企业名称、电话、地址等信息并回填。",
                f"系统提交前执行字段完整性、唯一性、负责人和权限校验，重点校验：{rule_text}。",
                f"校验通过后，系统保存{object_name}记录，生成操作日志，并在详情页展示基础信息、负责人和关联入口。",
            ],
            "update": [
                f"{actor}进入{object_name}详情或列表操作区，选择需要维护的记录。",
                f"系统加载当前{object_name}的{field_text}等信息，并展示可编辑范围。",
                f"{actor}修改字段、负责人、团队成员或状态等信息后提交。",
                f"系统校验权限、字段规则和状态约束，重点校验：{rule_text}。",
                f"系统保存变更，记录修改前后差异，并刷新列表、详情和相关统计视图。",
            ],
            "delete": [
                f"{actor}在{object_name}列表或详情页发起删除操作。",
                f"系统先检查{object_name}是否存在商机、合同、回款、发票或其他关联数据。",
                f"若不存在阻断性关联，系统要求二次确认并展示删除影响范围。",
                f"{actor}确认后，系统执行删除或归档，并记录操作日志。",
                f"若存在重要关联数据，系统拒绝直接删除并提示先处理关联关系。",
            ],
            "query": [
                f"{actor}进入{object_name}列表，选择关键词搜索、场景切换或高级筛选。",
                f"系统按客户名称、手机号、电话、负责人、状态、时间等条件组合检索。",
                f"系统返回符合条件的记录，并保留当前筛选条件用于场景保存或再次查询。",
                f"{actor}可查看列表字段、排序结果和统计辅助视图。",
                f"系统支持将高频筛选条件保存为业务场景，便于后续交接和复用。",
            ],
            "transfer": [
                f"{actor}在{object_name}操作栏选择转移，并指定新的负责人或团队成员。",
                f"系统展示是否移除原负责人、是否转为团队成员、只读/读写权限和有效期等配置项。",
                f"{actor}确认关联联系人、商机、合同等数据是否同步转移。",
                f"系统校验转移权限和关联数据一致性，重点校验：{rule_text}。",
                f"系统完成负责人变更、团队成员权限更新和关联数据同步，并形成转移记录。",
            ],
            "pool": [
                f"{actor}选择将{object_name}放入公海，或系统根据长期未跟进等规则触发公海释放。",
                f"系统检查锁定状态、负责人、公海成员可见范围和自动释放条件。",
                f"系统提示放入公海后的责任变化：原负责人不再负责该{object_name}。",
                f"{actor}确认后，系统更新公海归属和可见权限。",
                f"系统记录公海操作原因，供后续领取、交接和风险追踪使用。",
            ],
            "import": [
                f"{actor}选择导入{object_name}数据并上传导入文件。",
                f"系统解析文件字段，并与系统字段配置进行映射。",
                f"系统执行必填、格式、唯一性和重复数据校验，重点校验：{rule_text}。",
                f"{actor}选择重复数据处理方式，例如覆盖、跳过或人工修正。",
                f"系统导入有效数据，并输出成功数量、失败数量和失败原因清单。",
            ],
            "export": [
                f"{actor}基于当前筛选条件选择导出{object_name}数据。",
                f"系统校验导出权限、字段范围和数据可见范围。",
                f"{actor}确认导出字段和记录范围。",
                f"系统生成导出文件并记录导出人、导出时间和筛选条件。",
                f"系统保留导出操作日志，便于后续审计和交接复核。",
            ],
            "state_transition": [
                f"{actor}打开{object_name}详情页并选择推进阶段或切换状态。",
                f"系统检查当前阶段是否满足阶段任务、阶段记录或审批要求。",
                f"{actor}补充必要的阶段说明、跟进记录或审批材料。",
                f"系统校验状态流转条件，重点校验：{rule_text}。",
                f"系统更新阶段状态，并同步待办提醒、活动记录和相关统计。",
            ],
            "follow_up": [
                f"{actor}在{object_name}详情页新增跟进记录。",
                f"系统要求填写联系人、跟进方式、跟进内容、下次跟进时间、附件或常用语等信息。",
                f"{actor}提交跟进记录后，系统校验关键字段和可见权限。",
                f"系统保存跟进记录，并将下次跟进时间写入待办提醒。",
                f"跟进记录进入{object_name}时间线，作为培训、交接和设计辅助的可追溯证据。",
            ],
            "link": [
                f"{actor}在{object_name}详情页选择关联上游或下游业务对象。",
                f"系统展示可关联的客户、商机、合同、回款或发票记录。",
                f"{actor}选择目标记录并确认关联关系。",
                f"系统校验关联对象状态、权限和金额/负责人一致性。",
                f"系统保存关联关系，并在两个业务对象详情页同步展示关联入口。",
            ],
            "sync": [
                f"{actor}发起{function_name}，系统读取当前{object_name}及关联对象数据。",
                f"系统识别需要同步的负责人、金额、状态或关联字段。",
                f"系统按照文档规则执行同步，重点校验：{rule_text}。",
                f"系统对同步前后的差异进行记录，避免覆盖人工维护的重要信息。",
                f"同步完成后，系统刷新列表、详情页和关联模块数据。",
            ],
        }
        fallback = [
            f"{actor}在{object_name}相关页面发起{function_name}。",
            f"系统加载{field_text}等关键数据，并展示当前可操作范围。",
            f"{actor}补充业务信息并提交处理请求。",
            f"系统按文档证据校验权限、字段、状态和关联关系，重点校验：{rule_text}。",
            f"系统保存处理结果、记录操作日志，并将结论绑定到引用证据。",
        ]
        steps = action_steps.get(action_type, fallback)
        if "AI识别" in self._hit_snippet(hit, 600) and action_type == "create":
            return steps
        if action_type == "create":
            return [step for step in steps if "AI 识别" not in step][:5]
        return steps

    def _build_use_case_extensions(
        self,
        *,
        function_name: str,
        object_name: str,
        action_type: str,
        hit: dict[str, Any],
    ) -> list[str]:
        snippet = self._hit_snippet(hit, 1000)
        extensions: list[str] = []
        if "批量" in snippet:
            extensions.append(f"批量处理：用户可对多个{object_name}执行{function_name}，系统逐条返回成功和失败原因。")
        if "自定义" in snippet or "场景" in snippet:
            extensions.append(f"自定义场景：用户可将筛选条件保存为常用视图，并用于后续快速查询。")
        if "团队成员" in snippet:
            extensions.append("协作成员处理：用户可添加或移除团队成员，并设置只读、读写或有效期。")
        if "关联" in snippet or "联动" in snippet or "同步" in snippet:
            extensions.append(f"关联数据处理：系统同步检查{object_name}与客户、商机、合同、回款、发票等对象的联动关系。")
        if "导入" in snippet:
            extensions.append("导入扩展：重复数据可按规则覆盖、跳过或输出失败原因后人工修正。")
        if action_type == "query":
            extensions.append("图表视图：系统可基于当前筛选结果展示来源、行业、阶段或金额分布。")
        return extensions[:4] or [f"用户可在保存前返回修改{object_name}信息，系统重新执行校验后再提交。"]

    def _build_acceptance_criteria(
        self,
        *,
        function_name: str,
        object_name: str,
        action_type: str,
        rules: list[str],
        exceptions: list[str],
    ) -> list[str]:
        criteria = [
            f"正常路径下，{function_name}完成后系统能展示最新{object_name}状态或详情。",
            "所有关键操作均记录操作人、操作时间和处理结果。",
            "页面结果、列表结果和详情页数据保持一致。",
        ]
        if rules:
            criteria.append(f"已实现并可验证文档规则：{rules[0]}")
        if exceptions:
            criteria.append("异常路径能给出明确提示，且不会写入不完整或不一致的数据。")
        if action_type in {"delete", "transfer", "pool", "sync", "link"}:
            criteria.append("涉及关联数据时必须保留关联检查结果和处理日志。")
        return criteria[:5]

    def _build_use_case_postconditions(self, *, function_name: str, object_name: str, action_type: str) -> str:
        if action_type == "delete":
            return f"{object_name}被安全删除、归档或因关联约束被阻止；系统保留处理结论和证据。"
        if action_type == "query":
            return f"用户获得符合条件的{object_name}列表或视图，筛选条件可被复用。"
        if action_type == "transfer":
            return f"{object_name}负责人、团队成员权限和关联数据同步结果已更新并可追溯。"
        if action_type == "import":
            return f"{object_name}有效数据已入库，失败数据和失败原因可下载或复核。"
        return f"{function_name}结果已保存，关键字段、业务规则和引用证据可追溯。"

    def _build_handover_fallback(
        self,
        *,
        query: str,
        payload: dict[str, Any],
        evidence_context: dict[str, Any],
    ) -> dict[str, Any]:
        hits = self._top_scene_hits(evidence_context, limit=6)
        completed = []
        unfinished = []
        risk_register = []
        todos = []
        evidence_map = []

        for index, hit in enumerate(hits[:6], start=1):
            source = self._hit_source(hit)
            snippet = self._hit_snippet(hit)
            sentence = self._sentence_from_hit(hit, "检索片段可作为交接参考，但需要人工确认。")
            evidence_map.append(
                {
                    "conclusion": sentence,
                    "sourceDocument": source,
                    "evidenceSnippet": snippet,
                    "score": self._hit_score(hit),
                }
            )
            if self._looks_unfinished(snippet):
                unfinished.append(f"{sentence}（来源：{source}）")
                todos.append(
                    {
                        "taskName": f"确认并推进：{sentence[:36]}",
                        "priority": "high",
                        "riskLevel": "high",
                        "suggestedOwner": "项目负责人/对应模块负责人",
                        "owner": "项目负责人/对应模块负责人",
                        "dependentDocument": source,
                        "evidenceSource": source,
                        "status": "pending",
                    }
                )
            else:
                completed.append(f"{sentence}（来源：{source}）")
            if self._looks_risky(snippet) or index <= 2:
                risk_register.append(
                    {
                        "risk": f"交接信息需复核：{sentence[:48]}",
                        "type": "交接风险",
                        "description": f"交接信息需复核：{sentence[:48]}",
                        "impact": "可能影响接手者对进度、风险和待办优先级的判断。",
                        "suggestion": "结合最新进度记录、会议纪要或负责人确认后再定稿。",
                        "evidenceSnippet": snippet,
                        "sourceDocument": source,
                        "evidenceSource": source,
                    }
                )

        if hits and not todos:
            first = hits[0]
            todos.append(
                {
                    "taskName": "核对当前交接结论并补齐责任人",
                    "priority": "medium",
                    "riskLevel": "medium",
                    "suggestedOwner": "项目负责人",
                    "owner": "项目负责人",
                    "dependentDocument": self._hit_source(first),
                    "evidenceSource": self._hit_source(first),
                    "status": "pending",
                }
            )

        gaps = self._build_handover_gaps(evidence_context, hits)
        return {
            "source": "retrieval-fallback",
            "projectBackground": self._sentence_from_hit(hits[0] if hits else None, "当前知识库缺少明确的项目背景文档。"),
            "currentProgress": self._sentence_from_hit(hits[1] if len(hits) > 1 else (hits[0] if hits else None), "当前知识库缺少明确的项目进度说明。"),
            "completedItems": completed[:5],
            "completedFeatures": completed[:5],
            "unfinishedItems": unfinished[:5] or ["未检索到明确未完成事项，需要人工确认最新进度。"],
            "riskRegister": risk_register,
            "risks": risk_register,
            "todoList": todos,
            "todos": todos,
            "responsibilityBoundary": self._build_responsibility_boundary(hits),
            "roles": self._build_responsibility_boundary(hits),
            "dependentDocuments": self._dependent_documents_from_hits(hits),
            "dependentDocs": self._dependent_documents_from_hits(hits),
            "informationGaps": gaps,
            "handoverChecklist": [
                "确认项目背景和目标是否最新",
                "核对已完成事项和未完成事项",
                "确认风险登记表中的影响范围和处理建议",
                "为待办清单补齐责任人和完成标准",
                "补充缺失接口、测试、部署或负责人文档",
            ],
            "evidenceMap": evidence_map,
        }

    def _extract_design_feature_candidates(self, hits: list[dict[str, Any]], limit: int = 36) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        seen: set[str] = set()
        operation_pattern = re.compile(
            r"(新建|新增|创建|编辑|修改|删除|查询|查找|搜索|筛选|查看|转移|分配|导入|导出|审核|审批|推进|切换|保存|配置|同步|关联|生成|统计|跟进|提交|校验)[^。；;，,、\s]{1,18}"
        )
        heading_line_pattern = re.compile(r"^\s*#{3,4}\s*\d+(?:\.\d+)+\s*([^#。；;（(\r\n]{2,24})", re.M)
        management_pattern = re.compile(
            r"((?:客户|商机|合同|回款|发票|产品|负责人|团队成员|跟进记录|公海池|回款计划|开票信息|邮寄信息|场景|权限|审批|任务|统计)[^。；;，,、]{0,12}(?:管理|维护|配置|登记|归档|统计|看板|同步|联动|转移|筛选|审核|审批))"
        )

        for hit in hits:
            raw_text = self._hit_raw_text(hit, 2600)
            for match in heading_line_pattern.finditer(raw_text):
                if self._append_design_candidate(
                    candidates=candidates,
                    seen=seen,
                    raw_name=match.group(1),
                    hit=hit,
                ) and len(candidates) >= limit:
                    return candidates

        if len(candidates) >= 6:
            return candidates[:limit]

        for hit in hits:
            raw_text = self._hit_raw_text(hit, 2600)
            snippet = self._hit_snippet(hit, 1400)
            raw_names: list[str] = []
            raw_names.extend(match.group(0) for match in operation_pattern.finditer(snippet))
            raw_names.extend(match.group(1) for match in management_pattern.finditer(snippet))
            source_object = self._derive_object_from_source(hit)
            for sentence in re.split(r"[。；;.!?\n]", raw_text):
                sentence = sentence.strip()
                if not sentence:
                    continue
                if re.search(r"(系统应|系统需要|应支持|可以|可|需要|允许|不允许|必须)", sentence) and re.search(
                    r"(新建|新增|创建|编辑|修改|删除|查询|搜索|筛选|查看|转移|导入|导出|审核|审批|推进|切换|保存|配置|同步|关联|生成|统计|跟进|校验|管理)",
                    sentence,
                ):
                    action_match = operation_pattern.search(sentence)
                    if action_match:
                        raw_names.append(action_match.group(0))
                    elif source_object and source_object != "业务对象":
                        raw_names.append(f"{source_object}{self._action_label_from_sentence(sentence)}")
            for raw_name in raw_names:
                if self._append_design_candidate(
                    candidates=candidates,
                    seen=seen,
                    raw_name=raw_name,
                    hit=hit,
                ) and len(candidates) >= limit:
                    return candidates

        return candidates

    def _append_design_candidate(
        self,
        *,
        candidates: list[dict[str, Any]],
        seen: set[str],
        raw_name: Any,
        hit: dict[str, Any],
    ) -> bool:
        name = self._clean_design_candidate(raw_name)
        if not name or name in seen or self._looks_like_non_business_feature(name):
            return False
        seen.add(name)
        candidates.append(
            {
                "name": name,
                "description": self._feature_description_from_hit(name, hit),
                "sourceDocument": self._hit_source(hit),
                "evidenceSnippet": self._hit_snippet(hit, 1400),
                "evidenceScore": self._hit_score(hit),
                "hit": hit,
            }
        )
        return True

    def _clean_design_candidate(self, value: Any) -> str:
        text = str(value or "").strip()
        text = re.split(r"[\r\n]", text, maxsplit=1)[0]
        for marker in ["模块", "用户", "系统", "列表", "详情页", "销售人员", "负责人"]:
            if marker in text and not text.startswith(marker):
                text = text.split(marker, 1)[0]
        text = re.sub(r"^\d+(?:\.\d+)*\s*", "", text)
        text = re.sub(r"^#+\s*", "", text)
        text = re.sub(r"^(用户|销售人员|管理员|系统|该模块|模块|功能|应|可|可以|需要|支持)", "", text)
        text = re.sub(r"(用户可以|系统应|系统需要|应支持|列表应|详情页应|负责人可|中可).*$", "", text)
        text = re.sub(r"(时|后|中|页面|列表)$", "", text)
        text = re.sub(r"\s+", "", text)
        text = text.strip("：:，,。；;、- ")
        return text[:24]

    def _action_label_from_sentence(self, sentence: str) -> str:
        for keyword, label in [
            ("筛选", "筛选"),
            ("搜索", "搜索"),
            ("查询", "查询"),
            ("新建", "新建"),
            ("创建", "创建"),
            ("编辑", "编辑"),
            ("修改", "编辑"),
            ("删除", "删除"),
            ("转移", "转移"),
            ("同步", "同步"),
            ("关联", "关联"),
            ("审核", "审核"),
            ("审批", "审批"),
            ("统计", "统计"),
            ("跟进", "跟进"),
            ("校验", "校验"),
            ("配置", "配置"),
            ("导入", "导入"),
            ("导出", "导出"),
            ("查看", "查看"),
        ]:
            if keyword in sentence:
                return label
        return "管理"

    def _feature_description_from_hit(self, name: str, hit: dict[str, Any]) -> str:
        sentence = self._sentence_from_hit(hit, f"根据 {self._hit_source(hit)} 抽取 {name} 功能。")
        return f"{sentence}；设计时需要明确输入字段、角色权限、异常路径和证据追踪。"

    def _looks_like_non_business_feature(self, value: str) -> bool:
        if re.search(r"Docker|Top-?K|Rerank|chunk|LLM|向量|端口|日志|CPU|内存|部署|启动|配置文件", value, re.I):
            return True
        if re.search(r"模块定位|核心业务对象|主要功能需求|来源|原始链接|说明|业务对象|演示|重新组织", value):
            return True
        if len(value) < 3:
            return True
        return False

    def _extract_business_terms(self, hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
        candidates = [
            "客户",
            "商机",
            "合同",
            "回款",
            "发票",
            "负责人",
            "团队成员",
            "管理员",
            "普通成员",
            "订单",
            "用户",
            "角色",
            "项目",
        ]
        text = " ".join(self._hit_snippet(hit, 400) for hit in hits)
        result = []
        for term in candidates:
            if term in text:
                result.append({"name": term, "sourceDocument": self._first_source_for_term(term, hits)})
        if result:
            return result[:8]
        return [
            {
                "name": self._derive_object_from_source(hit),
                "sourceDocument": self._hit_source(hit),
            }
            for hit in hits[:4]
        ]

    def _first_source_for_term(self, term: str, hits: list[dict[str, Any]]) -> str:
        for hit in hits:
            if term in self._hit_snippet(hit, 400):
                return self._hit_source(hit)
        return "当前知识库"

    def _derive_object_from_source(self, hit: dict[str, Any]) -> str:
        source = self._hit_source(hit)
        stem = re.sub(r"\.(pdf|docx?|xlsx?|md|txt|pptx?)$", "", source, flags=re.I)
        stem = re.sub(r"需求|说明书|设计|文档|记录|模板|手册", "", stem).strip("_- ")
        return stem[:16] or "业务对象"

    def _extract_rule_candidates(self, hits: list[dict[str, Any]], limit: int = 6) -> list[dict[str, Any]]:
        rules = []
        pattern = re.compile(r"(必须|不能|不允许|需要|应当|状态|审批|校验|唯一|重复|删除|转移|超限|关联|联动)[^。；;.!?]{0,80}")
        for hit in hits:
            snippet = self._hit_snippet(hit, 420)
            for match in pattern.finditer(snippet):
                sentence = match.group(0).strip() or self._sentence_from_hit(hit, "待确认业务规则")
                rules.append(
                    {
                        "rule": sentence,
                        "sourceDocument": self._hit_source(hit),
                        "evidenceSnippet": snippet[:180],
                    }
                )
                if len(rules) >= limit:
                    return rules
        if rules:
            return rules[:limit]
        return [
            {
                "rule": "当前检索片段未明确给出业务规则，需要人工从需求文档中补充。",
                "sourceDocument": "当前知识库",
                "evidenceSnippet": "",
            }
        ]

    def _derive_function_name(self, hit: dict[str, Any], index: int) -> str:
        snippet = self._hit_snippet(hit, 160)
        patterns = [
            r"(新增|创建|编辑|修改|删除|查询|审核|审批|分配|转移|导入|导出|生成|查看)[^。；;，,]{2,18}",
            r"([^。；;，,]{2,18}(管理|维护|配置|登记|归档|统计|看板))",
        ]
        for pattern in patterns:
            match = re.search(pattern, snippet)
            if match:
                value = match.group(0).strip()
                return value[:24]
        return f"{self._derive_object_from_source(hit)}功能{index}"

    def _derive_module_name(self, hit: dict[str, Any], index: int, fallback: str) -> str:
        source_object = self._derive_object_from_source(hit)
        if source_object and source_object != "业务对象":
            return f"{source_object}模块"
        return f"{fallback}模块{index}"

    def _infer_actor(self, hit: dict[str, Any]) -> str:
        snippet = self._hit_snippet(hit, 240)
        for actor in ["管理员", "负责人", "团队成员", "普通成员", "销售人员", "测试人员", "项目负责人", "用户"]:
            if actor in snippet:
                return actor
        return "业务用户"

    def _infer_exception_items(self, hit: dict[str, Any]) -> list[str]:
        snippet = self._hit_snippet(hit, 320)
        exceptions = []
        for keyword, item in [
            ("必填", "必填字段缺失时提示用户补充。"),
            ("重复", "检测到重复数据时阻止提交并提示处理。"),
            ("删除", "存在关联数据时删除操作需要限制或二次确认。"),
            ("金额", "金额超限或不一致时进入异常处理。"),
            ("权限", "当前角色无权限时拒绝操作并提示。"),
            ("状态", "状态不满足流转条件时阻止操作。"),
        ]:
            if keyword in snippet:
                exceptions.append(item)
        return exceptions or ["证据不足时不生成正式异常结论，进入待确认问题。"]

    def _infer_fields(self, hit: dict[str, Any]) -> list[str]:
        snippet = self._hit_snippet(hit, 360)
        fields = []
        for field in ["名称", "编号", "状态", "金额", "负责人", "团队成员", "创建时间", "更新时间", "备注", "客户", "合同", "发票"]:
            if field in snippet:
                fields.append(field)
        return fields[:8] or ["id", "name", "status", "owner"]

    def _build_permission_analysis(self, hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
        roles = []
        text = " ".join(self._hit_snippet(hit, 300) for hit in hits)
        for role in ["管理员", "负责人", "团队成员", "普通成员", "项目负责人", "测试人员", "产品"]:
            if role in text:
                roles.append(
                    {
                        "role": role,
                        "permissionBoundary": "文档片段提到该角色，但具体可操作范围需要结合权限矩阵确认。",
                        "sourceDocument": self._first_source_for_term(role, hits),
                    }
                )
        return roles or [
            {
                "role": "待确认角色",
                "permissionBoundary": "当前检索证据不足以确认负责人、团队成员、管理员、普通成员之间的权限边界。",
                "sourceDocument": "当前知识库",
            }
        ]

    def _count_exception_signals(self, hits: list[dict[str, Any]]) -> int:
        keywords = ["必填", "重复", "删除", "金额", "权限", "状态", "异常", "失败", "超限", "不可", "不能", "不允许"]
        count = 0
        for hit in hits:
            snippet = self._hit_snippet(hit, 520)
            count += sum(1 for keyword in keywords if keyword in snippet)
        return count

    def _build_exception_scenarios(self, hits: list[dict[str, Any]], limit: int = 6) -> list[dict[str, Any]]:
        items = []
        for hit in hits:
            for exception in self._infer_exception_items(hit):
                if exception == "证据不足时不生成正式异常结论，进入待确认问题。":
                    continue
                items.append(
                    {
                        "scenario": exception,
                        "sourceDocument": self._hit_source(hit),
                        "evidenceSnippet": self._hit_snippet(hit),
                    }
                )
                if len(items) >= limit:
                    return items
        return items[:limit]

    def _build_design_risks(
        self,
        *,
        hits: list[dict[str, Any]],
        functions: list[dict[str, Any]],
        business_rules: list[dict[str, Any]],
        limit: int,
    ) -> list[dict[str, Any]]:
        risks: list[dict[str, Any]] = []
        seen: set[str] = set()
        risk_patterns = [
            ("必填", "必填字段缺失或字段配置不一致", "可能导致关键业务数据不完整，影响后续合同、回款或发票关联。", "补充字段配置表和保存校验规则。"),
            ("唯一", "唯一性规则和重复数据处理", "重复客户、商机、合同或发票可能造成统计口径混乱。", "明确唯一字段、重复提示和合并处理策略。"),
            ("重复", "重复数据校验", "重复记录会影响客户跟进、商机推进和财务统计。", "补充重复判断字段和冲突处理流程。"),
            ("删除", "删除约束和关联数据保护", "误删上游数据可能破坏合同、回款、发票等跨模块追踪链路。", "明确有关联数据时的禁止删除、二次确认或归档策略。"),
            ("金额", "金额同步和超限校验", "商机、合同、回款、发票金额不一致会影响财务统计和审批。", "补充金额来源、同步规则、部分开票和超限处理说明。"),
            ("权限", "负责人和团队成员权限边界", "权限边界不清会导致越权查看、编辑或转移业务数据。", "补充角色权限矩阵和只读/读写边界。"),
            ("状态", "状态流转条件", "跳过必要阶段或状态不一致会影响流程审计和交接判断。", "补充状态机、阶段任务和流转条件。"),
            ("审批", "审批节点和审核结果处理", "审批结果不明确会阻塞合同、回款或发票进入下一步流程。", "补充审批流程、驳回后处理和操作日志要求。"),
            ("关联", "跨模块关联一致性", "客户、商机、合同、回款、发票之间的数据链路断裂会影响追踪和统计。", "补充关联字段、同步时机和异常回滚规则。"),
            ("同步", "跨模块数据同步一致性", "同步字段不一致会造成页面展示、统计报表和审批依据冲突。", "补充同步来源、覆盖规则和人工修改权限。"),
        ]
        for hit in hits:
            snippet = self._hit_snippet(hit, 1400)
            for keyword, description, impact, suggestion in risk_patterns:
                if keyword not in snippet or description in seen:
                    continue
                seen.add(description)
                risks.append(
                    {
                        "description": description,
                        "impact": impact,
                        "suggestion": suggestion,
                        "supplement": suggestion,
                        "confidence": "中" if self._hit_score(hit) >= 0.25 else "低",
                        "needsReview": True,
                        "sourceDocument": self._hit_source(hit),
                        "evidenceSnippet": snippet,
                    }
                )
                if len(risks) >= limit:
                    return risks

        for rule in business_rules:
            if len(risks) >= limit:
                break
            rule_text = str(rule.get("rule") if isinstance(rule, dict) else rule)
            if not rule_text or rule_text in seen:
                continue
            seen.add(rule_text)
            risks.append(
                {
                    "description": f"业务规则需复核：{rule_text[:36]}",
                    "impact": "规则未确认会影响详细文本用例、接口约束和评审通过率。",
                    "suggestion": "将该规则补充到需求说明、接口文档或验收标准中。",
                    "supplement": "需求说明、接口文档或验收标准。",
                    "confidence": "中",
                    "needsReview": True,
                    "sourceDocument": rule.get("sourceDocument", "当前知识库") if isinstance(rule, dict) else "当前知识库",
                    "evidenceSnippet": rule.get("evidenceSnippet", "") if isinstance(rule, dict) else "",
                }
            )

        if not risks and functions:
            first = functions[0]
            risks.append(
                {
                    "description": "当前功能证据需要人工复核边界",
                    "impact": "若缺少规则、权限或异常流程证据，生成结果不能直接作为正式设计结论。",
                    "suggestion": "补充需求说明、权限矩阵、异常流程和验收标准。",
                    "supplement": "需求说明、权限矩阵、异常流程和验收标准。",
                    "confidence": "低",
                    "needsReview": True,
                    "sourceDocument": first.get("sourceDocument", "当前知识库"),
                    "evidenceSnippet": first.get("evidenceSnippet", ""),
                }
            )
        return risks[:limit]

    def _infer_missing_design_aspects(self, evidence_context: dict[str, Any]) -> list[str]:
        groups = evidence_context.get("groups", [])
        missing = []
        labels = {
            "business_objects_roles": "业务对象/角色说明",
            "rules_states": "业务规则/状态流转",
            "permissions_owners": "权限矩阵/负责人规则",
            "exceptions_limits": "异常流程/限制条件",
            "cross_module_consistency": "跨模块关联/数据一致性",
        }
        for group in groups:
            if group.get("name") in labels and not group.get("hits"):
                missing.append(labels[group["name"]])
        return missing or ["接口设计细节", "测试用例或验收标准"]

    def _build_design_open_questions(self, missing: list[str]) -> list[str]:
        return [f"当前证据不足：请补充或确认{item}。" for item in missing[:6]]

    def _dedupe_modules(self, modules: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        seen: set[str] = set()
        for item in modules:
            name = str(item.get("name") or "")
            if not name or name in seen:
                continue
            seen.add(name)
            result.append(item)
        return result[:5]

    def _looks_unfinished(self, text: str) -> bool:
        return bool(re.search(r"未完成|待办|待确认|缺少|风险|阻塞|TODO|待补充|问题", text, re.I))

    def _looks_risky(self, text: str) -> bool:
        return bool(re.search(r"风险|异常|阻塞|缺少|失败|错误|无法|不明确|待确认|超期|冲突", text, re.I))

    def _build_handover_gaps(self, evidence_context: dict[str, Any], hits: list[dict[str, Any]]) -> list[str]:
        gaps = []
        labels = {
            "progress_completed": "缺少最新进度和已完成事项证据",
            "unfinished_todos": "缺少未完成事项和待办任务证据",
            "risks_blockers": "缺少风险、阻塞点或异常情况证据",
            "responsibility": "缺少负责人、角色或责任边界证据",
            "dependent_documents": "缺少依赖文档或交接材料清单",
        }
        for group in evidence_context.get("groups", []):
            if group.get("name") in labels and not group.get("hits"):
                gaps.append(labels[group["name"]])
        text = " ".join(self._hit_snippet(hit, 240) for hit in hits)
        for keyword, gap in [
            ("接口", "缺少接口文档或接口异常处理说明"),
            ("测试", "缺少测试记录或验收结果"),
            ("部署", "缺少部署说明或环境启动文档"),
            ("负责人", "缺少明确负责人信息"),
        ]:
            if keyword not in text:
                gaps.append(gap)
        return list(dict.fromkeys(gaps))[:8]

    def _build_responsibility_boundary(self, hits: list[dict[str, Any]]) -> list[dict[str, str]]:
        roles = ["产品", "前端", "后端", "测试", "运维", "项目负责人"]
        text = " ".join(self._hit_snippet(hit, 260) for hit in hits)
        result = []
        for role in roles:
            if role in text:
                result.append({"role": role, "responsibility": "文档中出现该角色，具体责任边界需结合交接材料确认。"})
        return result or [
            {"role": "项目负责人", "responsibility": "确认进度、风险、责任人和交接范围。"},
            {"role": "研发/测试成员", "responsibility": "核对模块实现、接口依赖、测试状态和未完成事项。"},
        ]

    def _dependent_documents_from_hits(self, hits: list[dict[str, Any]]) -> list[str]:
        docs = []
        for hit in hits:
            source = self._hit_source(hit)
            if source not in docs:
                docs.append(source)
        return docs[:8]

    def _normalize_design_payload(self, payload: dict[str, Any], *, fallback: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict) or not payload:
            result = dict(fallback)
            result["warning"] = "结构化解析失败，已使用检索兜底结果。"
            return self._finalize_design_payload(result)

        result = dict(fallback)
        for key in [
            "source",
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
            "evidenceCoverage",
            "nextActions",
            "diagram",
        ]:
            value = payload.get(key) or payload.get(self._camel_to_snake(key))
            if value:
                result[key] = value
        result["source"] = result.get("source") or "model-json"
        return self._finalize_design_payload(result)

    def _complete_sparse_design_payload(self, payload: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
        result = dict(payload)
        merge_specs = [
            ("functionList", "name"),
            ("useCases", "name"),
            ("businessRules", "rule"),
            ("moduleSuggestions", "name"),
            ("dataObjects", "name"),
            ("risks", "description"),
            ("nextActions", "action"),
            ("traceabilityMatrix", "functionName"),
        ]
        for key, identity_key in merge_specs:
            current = self._as_list(result.get(key))
            fallback_items = self._as_list(fallback.get(key))
            if len(current) >= len(fallback_items):
                continue
            result[key] = self._merge_structured_items(current, fallback_items, identity_key)

        if len(self._as_list(result.get("useCases"))) < len(self._as_list(result.get("functionList"))):
            result["useCases"] = self._merge_structured_items(
                self._as_list(result.get("useCases")),
                self._as_list(fallback.get("useCases")),
                "name",
            )

        if not result.get("diagram"):
            result["diagram"] = fallback.get("diagram") or ""
        result["source"] = result.get("source") or payload.get("source") or "model-json"
        if result.get("source") == "model-json":
            result["warning"] = result.get("warning") or "模型结构化结果数量少于检索证据可拆解内容，已使用证据候选补齐部分字段。"
        return self._finalize_design_payload(result)

    def _merge_structured_items(self, current: list[Any], fallback_items: list[Any], identity_key: str) -> list[Any]:
        merged = list(current)
        seen = {self._item_identity(item, identity_key) for item in merged}
        for item in fallback_items:
            identity = self._item_identity(item, identity_key)
            if identity and identity in seen:
                continue
            merged.append(item)
            if identity:
                seen.add(identity)
        return merged

    def _item_identity(self, item: Any, identity_key: str) -> str:
        if isinstance(item, dict):
            value = (
                item.get(identity_key)
                or item.get("name")
                or item.get("id")
                or item.get("description")
                or item.get("rule")
                or item.get("action")
            )
        else:
            value = item
        return str(value or "").strip()

    def _finalize_design_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        function_list = []
        for index, item in enumerate(self._as_list(payload.get("functionList")), start=1):
            if isinstance(item, str):
                item = {"name": item, "description": item}
            if not isinstance(item, dict):
                continue
            source = item.get("sourceDocument") or item.get("relatedDocument") or item.get("documentTitle") or "当前知识库"
            function_list.append(
                {
                    "id": item.get("id") or f"F-{index:03d}",
                    "name": item.get("name") or item.get("functionName") or f"功能{index}",
                    "description": item.get("description") or item.get("desc") or "待补充功能描述。",
                    "priority": item.get("priority") or "medium",
                    "sourceDocument": source,
                    "relatedDocument": item.get("relatedDocument") or source,
                    "evidenceSnippet": item.get("evidenceSnippet") or item.get("snippet") or "",
                    "evidenceScore": item.get("evidenceScore") or item.get("score") or 0,
                }
            )

        use_cases = []
        for index, item in enumerate(self._as_list(payload.get("useCases")), start=1):
            if isinstance(item, str):
                item = {"name": item}
            if not isinstance(item, dict):
                continue
            use_cases.append(
                {
                    "id": item.get("id") or f"UC-{index:03d}",
                    "name": item.get("name") or item.get("useCaseName") or f"用例{index}",
                    "goal": item.get("goal") or item.get("objective") or item.get("brief") or "",
                    "trigger": item.get("trigger") or item.get("triggerCondition") or item.get("trigger_condition") or "",
                    "actor": item.get("actor") or item.get("participant") or "业务用户",
                    "scope": item.get("scope") or item.get("module") or item.get("moduleName") or "",
                    "level": item.get("level") or "user-goal",
                    "preconditions": self._as_list(item.get("preconditions") or item.get("precondition")),
                    "mainSuccessScenario": self._as_list(
                        item.get("mainSuccessScenario") or item.get("main_success_scenario") or item.get("mainFlow")
                    ),
                    "extensionScenarios": self._as_list(item.get("extensionScenarios") or item.get("extensions")),
                    "exceptionScenarios": self._as_list(item.get("exceptionScenarios") or item.get("exceptions")),
                    "businessRules": self._as_list(item.get("businessRules") or item.get("business_rules")),
                    "dataFields": self._as_list(item.get("dataFields") or item.get("data_fields") or item.get("fields")),
                    "acceptanceCriteria": self._as_list(item.get("acceptanceCriteria") or item.get("acceptance_criteria")),
                    "postconditions": item.get("postconditions") or item.get("postcondition") or "待补充",
                    "sourceDocument": item.get("sourceDocument") or item.get("relatedDocument") or "当前知识库",
                    "evidenceSnippet": item.get("evidenceSnippet") or item.get("snippet") or "",
                    "evidenceScore": item.get("evidenceScore") or item.get("score") or 0,
                }
            )

        modules = []
        for index, item in enumerate(self._as_list(payload.get("moduleSuggestions")), start=1):
            if isinstance(item, str):
                item = {"name": item, "responsibility": item}
            if not isinstance(item, dict):
                continue
            modules.append(
                {
                    "name": item.get("name") or item.get("moduleName") or f"模块{index}",
                    "responsibility": item.get("responsibility") or item.get("description") or "待补充模块职责。",
                    "input": self._as_list(item.get("input") or item.get("inputs")),
                    "output": self._as_list(item.get("output") or item.get("outputs")),
                    "dependencies": self._as_list(item.get("dependencies") or item.get("dependency")),
                    "sourceDocument": item.get("sourceDocument") or "当前知识库",
                }
            )

        risks = []
        for item in self._as_list(payload.get("risks")):
            if isinstance(item, str):
                item = {"description": item}
            if not isinstance(item, dict):
                continue
            risks.append(
                {
                    "description": item.get("description") or item.get("risk") or "待确认风险",
                    "impact": item.get("impact") or "待确认影响范围",
                    "suggestion": item.get("suggestion") or item.get("supplement") or "补充相关文档。",
                    "supplement": item.get("supplement") or item.get("suggestion") or "补充相关文档。",
                    "confidence": item.get("confidence") or "中",
                    "needsReview": bool(item.get("needsReview", item.get("needs_review", True))),
                    "sourceDocument": item.get("sourceDocument") or item.get("evidenceSource") or "当前知识库",
                    "evidenceSnippet": item.get("evidenceSnippet") or item.get("snippet") or "",
                }
            )

        coverage = payload.get("evidenceCoverage") if isinstance(payload.get("evidenceCoverage"), dict) else {}
        if not coverage:
            coverage = {
                "coveredAspects": ["功能清单", "文本用例"] if function_list or use_cases else [],
                "missingAspects": payload.get("openQuestions") or [],
                "coverageLevel": "partial" if function_list or use_cases else "insufficient",
                "reviewSuggestion": "请人工复核证据覆盖情况。",
            }

        result = {
            **payload,
            "source": payload.get("source") or "model-json",
            "businessObjects": self._as_list(payload.get("businessObjects")),
            "businessRules": self._as_list(payload.get("businessRules")),
            "functionList": function_list,
            "useCases": use_cases,
            "moduleSuggestions": modules,
            "dataObjects": self._as_list(payload.get("dataObjects")),
            "permissionAnalysis": self._as_list(payload.get("permissionAnalysis")),
            "exceptionScenarios": self._as_list(payload.get("exceptionScenarios")),
            "risks": risks,
            "openQuestions": self._as_list(payload.get("openQuestions")),
            "traceabilityMatrix": self._as_list(payload.get("traceabilityMatrix")),
            "evidenceCoverage": coverage,
            "nextActions": self._normalize_next_actions(payload.get("nextActions")),
        }
        if not result.get("diagram"):
            result["diagram"] = self._build_design_diagram(result)
        return result

    def _normalize_handover_payload(self, payload: dict[str, Any], *, fallback: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict) or not payload:
            result = dict(fallback)
            result["warning"] = "结构化解析失败，已使用检索兜底结果。"
            return self._finalize_handover_payload(result)

        result = dict(fallback)
        for key in [
            "source",
            "projectBackground",
            "currentProgress",
            "completedItems",
            "unfinishedItems",
            "riskRegister",
            "todoList",
            "responsibilityBoundary",
            "dependentDocuments",
            "informationGaps",
            "handoverChecklist",
            "evidenceMap",
        ]:
            value = payload.get(key) or payload.get(self._camel_to_snake(key))
            if value:
                result[key] = value
        result["source"] = result.get("source") or "model-json"
        return self._finalize_handover_payload(result)

    def _finalize_handover_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        risks = []
        for item in self._as_list(payload.get("riskRegister") or payload.get("risks")):
            if isinstance(item, str):
                item = {"risk": item, "description": item}
            if not isinstance(item, dict):
                continue
            risk_text = item.get("risk") or item.get("description") or "待确认风险"
            source = item.get("sourceDocument") or item.get("evidenceSource") or "当前知识库"
            risks.append(
                {
                    "risk": risk_text,
                    "type": item.get("type") or "交接风险",
                    "description": item.get("description") or risk_text,
                    "impact": item.get("impact") or "待确认影响范围",
                    "suggestion": item.get("suggestion") or "补充文档或人工确认。",
                    "evidenceSnippet": item.get("evidenceSnippet") or item.get("snippet") or "",
                    "sourceDocument": source,
                    "evidenceSource": item.get("evidenceSource") or source,
                }
            )

        todos = []
        for item in self._as_list(payload.get("todoList") or payload.get("todos")):
            if isinstance(item, str):
                item = {"taskName": item}
            if not isinstance(item, dict):
                continue
            source = item.get("dependentDocument") or item.get("evidenceSource") or "待确认文档"
            todos.append(
                {
                    "taskName": item.get("taskName") or item.get("task") or "待办事项",
                    "priority": item.get("priority") or "medium",
                    "riskLevel": item.get("riskLevel") or item.get("risk_level") or "medium",
                    "suggestedOwner": item.get("suggestedOwner") or item.get("owner") or "待确认角色",
                    "owner": item.get("owner") or item.get("suggestedOwner") or "待确认角色",
                    "dependentDocument": source,
                    "evidenceSource": item.get("evidenceSource") or source,
                    "status": item.get("status") or "pending",
                    "dueDate": item.get("dueDate") or item.get("due_date") or "",
                }
            )

        roles = []
        for item in self._as_list(payload.get("responsibilityBoundary") or payload.get("roles")):
            if isinstance(item, str):
                item = {"role": item, "responsibility": item}
            if not isinstance(item, dict):
                continue
            roles.append(
                {
                    "role": item.get("role") or item.get("name") or "项目成员",
                    "responsibility": item.get("responsibility") or item.get("boundary") or "待确认责任边界。",
                }
            )

        dependent_documents = self._as_list(payload.get("dependentDocuments") or payload.get("dependentDocs"))
        completed = self._as_list(payload.get("completedItems") or payload.get("completedFeatures"))
        return {
            **payload,
            "source": payload.get("source") or "model-json",
            "projectBackground": str(payload.get("projectBackground") or ""),
            "currentProgress": str(payload.get("currentProgress") or ""),
            "completedItems": completed,
            "completedFeatures": completed,
            "unfinishedItems": self._as_list(payload.get("unfinishedItems")),
            "riskRegister": risks,
            "risks": risks,
            "todoList": todos,
            "todos": todos,
            "responsibilityBoundary": roles,
            "roles": roles,
            "dependentDocuments": dependent_documents,
            "dependentDocs": dependent_documents,
            "informationGaps": self._as_list(payload.get("informationGaps")),
            "handoverChecklist": self._as_list(payload.get("handoverChecklist")),
            "evidenceMap": self._as_list(payload.get("evidenceMap")),
        }

    def _normalize_next_actions(self, value: Any) -> list[dict[str, Any]]:
        result = []
        for index, item in enumerate(self._as_list(value), start=1):
            if isinstance(item, str):
                item = {"action": item}
            if not isinstance(item, dict):
                continue
            result.append(
                {
                    "action": item.get("action") or item.get("title") or f"后续动作{index}",
                    "priority": item.get("priority") or "medium",
                    "owner": item.get("owner") or item.get("suggestedOwner") or "项目成员",
                    "dependentDocument": item.get("dependentDocument") or item.get("documentTitle") or "待关联文档",
                    "doneDefinition": item.get("doneDefinition") or item.get("acceptanceCriteria") or "完成标准待补充",
                }
            )
        return result

    def _as_list(self, value: Any) -> list[Any]:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, tuple):
            return list(value)
        return [value]

    def _camel_to_snake(self, value: str) -> str:
        return re.sub(r"(?<!^)(?=[A-Z])", "_", value).lower()

    def _summarize_design_result(self, payload: dict[str, Any]) -> str:
        functions = payload.get("functionList") or []
        rules = payload.get("businessRules") or []
        open_questions = payload.get("openQuestions") or []
        return (
            f"已基于检索证据生成 {len(functions)} 项功能、{len(payload.get('useCases') or [])} 个文本用例、"
            f"{len(payload.get('moduleSuggestions') or [])} 个模块建议，并抽取 {len(rules)} 条业务规则。"
            f"仍有 {len(open_questions)} 个待确认问题需要人工复核。"
        )

    def _summarize_handover_result(self, payload: dict[str, Any]) -> str:
        return (
            f"{payload.get('currentProgress') or payload.get('projectBackground') or '已生成交接结构化结果。'} "
            f"待办 {len(payload.get('todoList') or [])} 项，风险 {len(payload.get('riskRegister') or [])} 项，"
            f"信息缺口 {len(payload.get('informationGaps') or [])} 项。"
        ).strip()

    def _build_design_artifacts(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            {"title": "业务对象", "items": [item.get("name", str(item)) if isinstance(item, dict) else str(item) for item in payload.get("businessObjects", [])]},
            {"title": "业务规则", "items": [item.get("rule", str(item)) if isinstance(item, dict) else str(item) for item in payload.get("businessRules", [])]},
            {"title": "证据覆盖", "items": payload.get("evidenceCoverage", {}).get("coveredAspects", [])},
        ]

    def _build_handover_artifacts(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            {"title": "依赖文档", "items": payload.get("dependentDocuments", [])},
            {"title": "交接检查清单", "items": payload.get("handoverChecklist", [])},
            {"title": "信息缺口", "items": payload.get("informationGaps", [])},
        ]

    def _infer_scene_evidence_level(self, citations: list[dict[str, Any]], payload: dict[str, Any]) -> str:
        penalties = payload.get("openQuestions") or payload.get("informationGaps") or []
        if not citations:
            return "low"
        best_score = max(float(item.get("relevanceScore") or item.get("score") or 0) for item in citations)
        if penalties:
            return "medium" if best_score >= 0.35 and len(citations) >= 3 else "low"
        if best_score >= 0.5 and len(citations) >= 3:
            return "high"
        if best_score >= 0.2 or len(citations) >= 2:
            return "medium"
        return "low"

    def _coverage_review_suggestion(self, payload: dict[str, Any]) -> str:
        coverage = payload.get("evidenceCoverage") if isinstance(payload.get("evidenceCoverage"), dict) else {}
        if coverage.get("reviewSuggestion"):
            return str(coverage["reviewSuggestion"])
        if payload.get("informationGaps"):
            return "交接结论仍存在信息缺口，请补充缺失文档并人工确认。"
        if payload.get("openQuestions"):
            return "设计结论仍存在待确认问题，请补充证据后进入评审。"
        return "当前结构化结果已绑定检索证据，建议人工复核后使用。"

    def _build_design_diagram(self, payload: dict[str, Any]) -> str:
        lines = ["flowchart TD"]
        lines.append('GOAL["设计目标"]')

        module_ids: list[str] = []
        for index, item in enumerate(payload.get("moduleSuggestions") or [], start=1):
            if not isinstance(item, dict):
                continue
            node_id = f"M{index}"
            label = self._diagram_label(item.get("name") or f"模块 {index}")
            lines.append(f'{node_id}["{label}"]')
            lines.append(f"GOAL --> {node_id}")
            module_ids.append(node_id)
            if index >= 4:
                break

        function_ids: list[str] = []
        for index, item in enumerate(payload.get("functionList") or [], start=1):
            if not isinstance(item, dict):
                continue
            node_id = f"F{index}"
            label = self._diagram_label(item.get("name") or f"功能 {index}")
            lines.append(f'{node_id}["{label}"]')
            parent = module_ids[(index - 1) % len(module_ids)] if module_ids else "GOAL"
            lines.append(f"{parent} --> {node_id}")
            function_ids.append(node_id)
            if index >= 6:
                break

        for index, item in enumerate(payload.get("useCases") or [], start=1):
            if not isinstance(item, dict):
                continue
            node_id = f"UC{index}"
            label = self._diagram_label(item.get("name") or f"用例 {index}")
            lines.append(f'{node_id}["{label}"]')
            parent = function_ids[(index - 1) % len(function_ids)] if function_ids else (module_ids[0] if module_ids else "GOAL")
            lines.append(f"{parent} --> {node_id}")
            if index >= 4:
                break

        return "\n".join(lines)

    def _diagram_label(self, value: Any) -> str:
        text = str(value or "").replace('"', "'").replace("\n", " ").strip()
        text = re.sub(r"\s+", " ", text)
        return text[:40] or "未命名节点"

    def _build_evidence(self, hits: list[dict[str, Any]]) -> list[str]:
        evidence = []
        for item in hits[:4]:
            source = item.get("metadata", {}).get("source_name") or "资料"
            excerpt = item.get("content", "").strip().replace("\n", " ")
            evidence.append(f"{source}: {excerpt[:140]}{'...' if len(excerpt) > 140 else ''}")
        if evidence:
            return evidence
        return ["当前知识库没有检索到相关片段，请先导入文档或调整问题表述。"]

    def _build_evidence_from_bundle(self, evidence_bundle: dict[str, Any]) -> list[str]:
        evidence = []
        for item in evidence_bundle.get("evidence", [])[:4]:
            source = item.get("source") or "Knowledge Base"
            section = item.get("section") or "chunk"
            content = str(item.get("content") or "").strip().replace("\n", " ")
            evidence.append(f"{source}#{section}: {content[:180]}{'...' if len(content) > 180 else ''}")
        if evidence:
            return evidence

        missing_information = [
            str(item).strip()
            for item in evidence_bundle.get("missing_information", [])
            if str(item).strip()
        ]
        if missing_information:
            return missing_information
        return ["当前知识库没有检索到足够证据，请补充项目文档或缩小问题范围后再试。"]

    def _build_scene_context(self, scene: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "scene": scene,
            "project": self._payload_text(payload, "project"),
            "role": self._payload_text(payload, "role"),
            "module": self._payload_text(payload, "module"),
            "focus": self._payload_text(payload, "focus"),
        }

    def _build_citations(self, hits: list[dict[str, Any]]) -> list[dict[str, str]]:
        citations = []
        for item in hits[:5]:
            metadata = item.get("metadata", {})
            source = metadata.get("source_name") or "知识库片段"
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

    def _build_risks(self, scene: str) -> list[str]:
        common = [
            "回答质量依赖当前已导入资料，资料不完整或过期时结论会受影响。",
            "如果相同主题分散在多份文档且命名不清晰，检索命中率会下降。",
        ]
        extras = {
            "training": ["培训输出如果缺少背景材料，新人会知道答案但不清楚上下文。"],
            "handover": ["交接输出如果没有最新进度文档，待办和风险可能不完整。"],
            "design": ["设计输出如果缺少需求和现有模块资料，功能边界容易漂移。"],
        }
        return common + extras.get(scene, [])

    def _build_next_actions(self, scene: str, payload: dict[str, Any]) -> list[str]:
        project = self._payload_text(payload, "project", "当前项目")
        common = [
            f"继续补充 {project} 的核心设计、交接和培训文档，提高检索覆盖率。",
            "将高频问题整理成固定模板，方便后续稳定复用。",
        ]
        extras = {
            "training": ["优先补充术语解释、系统主链路和新人上手资料。"],
            "handover": ["补齐当前进度、依赖接口、未完成事项和负责人信息。"],
            "design": ["把功能清单、文本用例和模块边界沉淀成结构化文档。"],
        }
        return common + extras.get(scene, [])

    def _build_artifacts(self, scene: str, payload: dict[str, Any], hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if scene != "design":
            return [
                {
                    "title": "相关资料",
                    "items": [item.get("metadata", {}).get("source_name") or "知识片段" for item in hits[:4]],
                }
            ]

        module_name = self._payload_text(payload, "module", "目标模块")
        feature_items = []
        for item in hits[:3]:
            excerpt = item.get("content", "").strip().replace("\n", " ")
            feature_items.append(excerpt[:80] + ("..." if len(excerpt) > 80 else ""))

        if not feature_items:
            feature_items = ["当前没有足够上下文，建议先导入需求、设计和交接资料。"]

        return [
            {"title": "功能清单候选", "items": feature_items},
            {
                "title": "文本用例建议",
                "items": [
                    f"用户进入 {module_name} 后输入目标问题并查看结构化结果。",
                    f"系统基于知识库检索 {module_name} 相关资料并生成设计草案。",
                    "用户根据输出继续补充模块边界、风险和后续动作。",
                ],
            },
            {
                "title": "模块边界建议",
                "items": ["前端页面交互", "检索与问答服务", "知识库文档治理", "结果记录与回看"],
            },
        ]
