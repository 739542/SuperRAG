from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from app.config import Settings
from app.core.document_loader import load_document
from app.services.chat_service import ChatService
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

    def list_documents(self) -> list[dict[str, Any]]:
        return [self._normalize_document(item) for item in self._repository.list_documents()]

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
            project=(payload.get("project") or "").strip(),
            collection_id=(
                payload.get("collection_id")
                or payload.get("collectionId")
                or payload.get("knowledge_base_id")
                or payload.get("knowledgeBaseId")
                or ""
            ).strip(),
        )
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
            risks.append("Unsupported claims detected: " + "; ".join(unsupported_claims[:3]))
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
            result.update(self._resolve_design_scene_output(payload=payload, answer=answer))
            result["intermediateDocument"] = self._write_design_intermediate_document(
                payload=payload,
                answer=answer,
                result=result,
            )
        return result

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

    def _normalize_document(self, item: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": item["id"],
            "collectionId": item["collection_id"],
            "collectionName": item.get("collection_name") or item.get("project") or "默认项目",
            "title": item.get("title") or item.get("original_name") or item.get("filename") or "未命名文档",
            "type": item.get("doc_type") or "未分类",
            "project": item.get("project") or item.get("collection_name") or "默认项目",
            "version": item.get("version") or "v1.0",
            "scene": item.get("scene") or "通用",
            "summary": item.get("summary") or "",
            "status": item.get("status") or "已入库",
            "originalName": item.get("original_name") or item.get("filename") or "",
            "chunkCount": item.get("chunk_count") or 0,
            "charCount": item.get("char_count") or 0,
            "createdAt": item.get("created_at") or "",
        }

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
        return {
            "id": chunk.get("id", ""),
            "documentId": chunk.get("document_id", ""),
            "position": chunk.get("position", 0),
            "content": chunk.get("content", ""),
            "sourceName": chunk.get("metadata", {}).get("source_name", ""),
        }

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

    def _build_system_prompt(self, scene: str, payload: dict[str, Any]) -> str:
        if scene == "design":
            return self._build_design_prompt(payload)

        focus = (payload.get("focus") or "").strip()
        role = (payload.get("role") or "").strip()
        module = (payload.get("module") or "").strip()
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

    def _build_design_prompt(self, payload: dict[str, Any]) -> str:
        output_type = (payload.get("module") or "").strip()
        focus = (payload.get("focus") or "").strip()
        strategy = self._build_design_output_strategy(output_type)
        return (
            "You are a software engineering design assistant working on top of retrieved project evidence. "
            "Use only grounded evidence from the current knowledge base. "
            "Do not treat infrastructure settings, deployment parameters, testing metrics, log paths, Docker settings, "
            "vector dimensions, chunk parameters, top-k values, reranker settings, or LLM settings as business functions. "
            "If the evidence does not support a conclusion, do not invent content. Put the gap into risks or nextActions.\n\n"
            "Return JSON only. Do not return Markdown. Do not return explanation text outside JSON.\n\n"
            "The top-level JSON object must always contain these fields:\n"
            "- functionList\n"
            "- useCases\n"
            "- moduleSuggestions\n"
            "- risks\n"
            "- nextActions\n"
            "- diagram\n\n"
            "Field schemas:\n"
            "- functionList items: id, name, description, priority, relatedDocument\n"
            "- useCases items: id, name, actor, preconditions, mainSuccessScenario, extensionScenarios, exceptionScenarios, postconditions\n"
            "- moduleSuggestions items: name, responsibility, input, output, dependencies\n"
            "- diagram: Mermaid source string, preferably flowchart TD\n\n"
            "Non-focused fields may be empty arrays or an empty diagram string. "
            "Do not fabricate content just to fill every field.\n\n"
            f"Requested output type: {output_type or 'design output'}.\n"
            f"Requested granularity: {focus or 'standard'}.\n\n"
            f"{strategy['focus_instruction']}\n"
            f"{strategy['field_instruction']}\n"
            f"{strategy['quality_instruction']}"
        )

    def _build_design_output_strategy(self, output_type: str) -> dict[str, str]:
        normalized = output_type.strip()
        default_strategy = {
            "focus_instruction": (
                "Generate a balanced design result with grounded functions, textual use cases, module suggestions, "
                "risks, and next actions."
            ),
            "field_instruction": (
                "Distribute output across the main fields, but still prefer the fields best supported by evidence."
            ),
            "quality_instruction": (
                "Keep the output concise but useful. Prefer fewer grounded items over many speculative items."
            ),
        }

        strategies = {
            "功能清单": {
                "focus_instruction": (
                    "Prioritize functionList as the main output. If evidence is sufficient, provide 5 to 8 grounded functions."
                ),
                "field_instruction": (
                    "Each function should describe a distinct business capability, not a technical configuration. "
                    "useCases and moduleSuggestions may stay brief or empty if evidence is weak."
                ),
                "quality_instruction": (
                    "Keep each function description concrete and traceable to evidence. risks and nextActions should still be provided."
                ),
            },
            "详细文本用例": {
                "focus_instruction": (
                    "Prioritize useCases as the main output. If evidence is sufficient, provide 3 to 5 grounded use cases. "
                    "functionList and moduleSuggestions may be empty arrays when the evidence mainly supports detailed use cases."
                ),
                "field_instruction": (
                    "For each use case, provide 1 to 3 preconditions, 4 to 6 mainSuccessScenario steps, "
                    "1 to 3 extensionScenarios when applicable, 1 to 2 exceptionScenarios when applicable, and a non-empty postconditions field."
                ),
                "quality_instruction": (
                    "Spend the output budget on richer use case details instead of spreading content thinly across unrelated fields. "
                    "If evidence is limited, return fewer use cases, but keep them grounded and complete."
                ),
            },
            "模块划分建议": {
                "focus_instruction": (
                    "Prioritize moduleSuggestions as the main output. If evidence is sufficient, provide 3 to 6 grounded modules."
                ),
                "field_instruction": (
                    "Each module should have a clear responsibility plus explicit input, output, and dependencies. "
                    "functionList and useCases may be brief or empty if the evidence is mainly architectural."
                ),
                "quality_instruction": (
                    "Prefer clear module boundaries over broad summaries. risks and nextActions should explain unresolved boundaries."
                ),
            },
            "接口设计建议": {
                "focus_instruction": (
                    "Prioritize interface-oriented design suggestions. Represent major interface capabilities in functionList "
                    "and supporting service boundaries in moduleSuggestions."
                ),
                "field_instruction": (
                    "Function descriptions should mention request purpose, key inputs, key outputs, or upstream/downstream relationships when supported by evidence. "
                    "useCases may stay short or empty if the evidence is mainly interface-focused."
                ),
                "quality_instruction": (
                    "Do not invent endpoints or protocols. If the evidence does not define an interface detail, put it into risks or nextActions."
                ),
            },
            "风险分析": {
                "focus_instruction": (
                    "Prioritize risks and nextActions as the main output. If evidence is sufficient, provide 4 to 6 grounded risks and 3 to 5 next actions."
                ),
                "field_instruction": (
                    "functionList, useCases, and moduleSuggestions may be empty or minimal if the user mainly requested risk analysis."
                ),
                "quality_instruction": (
                    "Each risk should describe the issue, its impact, and what evidence is still missing. Each next action should be concrete and reviewable."
                ),
            },
            "答辩说明稿": {
                "focus_instruction": (
                    "Prioritize a compact, defense-ready project summary using the structured fields already available."
                ),
                "field_instruction": (
                    "Use functionList for key capabilities, useCases for representative business flows, moduleSuggestions for architecture talking points, "
                    "risks for known limitations, and nextActions for future work."
                ),
                "quality_instruction": (
                    "Keep the structure concise and evidence-backed. Do not invent achievements or requirements that are not supported."
                ),
            },
        }
        return strategies.get(normalized, default_strategy)

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

    def _resolve_design_scene_output(
        self,
        *,
        payload: dict[str, Any],
        answer: dict[str, Any],
    ) -> dict[str, Any]:
        direct_payload = self._normalize_design_payload(
            {
                "functionList": answer.get("functionList") or answer.get("function_list") or [],
                "useCases": answer.get("useCases") or answer.get("use_cases") or [],
                "moduleSuggestions": answer.get("moduleSuggestions") or answer.get("module_suggestions") or [],
                "risks": answer.get("risks") or [],
                "nextActions": answer.get("nextActions") or answer.get("next_actions") or [],
                "diagram": answer.get("diagram") or "",
            }
        )
        if self._has_design_structure(direct_payload):
            return self._decorate_design_payload(payload=payload, answer=answer, structured=direct_payload)

        parsed_payload = self._parse_design_json(answer.get("answer", ""))
        if parsed_payload and self._has_design_structure(parsed_payload):
            normalized_payload = self._normalize_design_payload(parsed_payload)
            return self._decorate_design_payload(payload=payload, answer=answer, structured=normalized_payload)

        return self._build_design_backend_fallback(payload=payload, answer=answer)

    def _has_design_structure(self, payload: dict[str, Any]) -> bool:
        return any(
            payload.get(field)
            for field in ("functionList", "useCases", "moduleSuggestions")
        )

    def _normalize_design_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = {
            "functionList": payload.get("functionList") or payload.get("function_list") or [],
            "useCases": payload.get("useCases") or payload.get("use_cases") or [],
            "moduleSuggestions": payload.get("moduleSuggestions") or payload.get("module_suggestions") or [],
            "risks": payload.get("risks") or [],
            "nextActions": payload.get("nextActions") or payload.get("next_actions") or [],
            "diagram": str(payload.get("diagram") or payload.get("mermaid") or "").strip(),
        }
        if not result["diagram"]:
            result["diagram"] = self._build_design_diagram(result)
        return result

    def _decorate_design_payload(
        self,
        *,
        payload: dict[str, Any],
        answer: dict[str, Any],
        structured: dict[str, Any],
    ) -> dict[str, Any]:
        query = (payload.get("query") or "").strip()
        output_type = (payload.get("module") or "").strip() or "Design Output"
        granularity = (payload.get("focus") or "").strip() or "standard"
        project = (payload.get("project") or "").strip() or answer.get("collection", {}).get("name", "")
        citations = answer.get("citations", [])
        evidence_level = answer.get("evidenceLevel", "low")
        missing_information = answer.get("missing_information", [])
        unsupported_claims = answer.get("validator", {}).get("unsupported_claims", [])

        return {
            "title": f"{output_type} Structured Output",
            "inputQuestion": query,
            "project": project,
            "outputType": output_type,
            "outputTypeLabel": output_type,
            "granularity": granularity,
            "functionList": structured.get("functionList", []),
            "useCases": structured.get("useCases", []),
            "moduleSuggestions": structured.get("moduleSuggestions", []),
            "risks": structured.get("risks", []),
            "nextActions": structured.get("nextActions", []),
            "diagram": structured.get("diagram", ""),
            "qualityChecks": {
                "hasUncitedContent": not bool(citations),
                "hasRequirementGap": bool(missing_information),
                "requiresHumanReview": bool(missing_information or unsupported_claims),
                "readyForReview": bool(citations)
                and not missing_information
                and not unsupported_claims
                and self._has_design_structure(structured),
            },
            "structuredFromBackend": True,
            "structuredSource": "backend-structured",
            "evidenceLevel": evidence_level,
        }

    def _build_design_backend_fallback(
        self,
        *,
        payload: dict[str, Any],
        answer: dict[str, Any],
    ) -> dict[str, Any]:
        query = (payload.get("query") or "").strip()
        output_type = (payload.get("module") or "").strip() or "Design Output"
        granularity = (payload.get("focus") or "").strip() or "standard"
        project = (payload.get("project") or "").strip() or answer.get("collection", {}).get("name", "")
        missing_information = answer.get("missing_information", [])
        warnings = []
        if missing_information:
            warnings.extend(missing_information[:3])
        if answer.get("validator", {}).get("unsupported_claims"):
            warnings.append("Structured design output could not be verified from grounded evidence.")
        if not warnings:
            warnings.append("The backend could not produce a valid structured design JSON payload.")

        structured = {
            "functionList": [],
            "useCases": [],
            "moduleSuggestions": [],
            "risks": [
                {
                    "description": warning,
                    "impact": "Structured design output is incomplete.",
                    "supplement": "Regenerate after importing requirement, workflow, API, or prototype documents.",
                    "confidence": answer.get("evidenceLevel", "low"),
                    "needsReview": True,
                }
                for warning in warnings
            ],
            "nextActions": [
                {
                    "action": "Import more grounded project documents and regenerate the design output.",
                    "priority": "high",
                    "owner": "project team",
                    "dependentDocument": "requirements / API / workflow docs",
                    "doneDefinition": "The backend returns functionList, useCases, moduleSuggestions, risks, nextActions, and diagram.",
                }
            ],
            "diagram": "",
        }
        normalized = self._normalize_design_payload(structured)
        decorated = self._decorate_design_payload(payload=payload, answer=answer, structured=normalized)
        decorated.update(
            {
                "title": f"{output_type} Structured Output Unavailable",
                "inputQuestion": query,
                "project": project,
                "outputType": output_type,
                "outputTypeLabel": output_type,
                "granularity": granularity,
                "structuredFromBackend": True,
                "structuredSource": "backend-fallback",
            }
        )
        return decorated

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
        return ["No grounded evidence was found in the current knowledge base. Please import more project documents or refine the question."]

    def _write_design_intermediate_document(
        self,
        *,
        payload: dict[str, Any],
        answer: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, Any]:
        target_dir = self._settings.data_dir / "design_intermediate"
        target_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_type = str(result.get("outputTypeLabel") or result.get("outputType") or "design-output")
        slug = self._slugify_filename(output_type) or "design-output"
        filename = f"{timestamp}_{slug}.md"
        target_path = target_dir / filename

        content = self._build_design_intermediate_markdown(
            payload=payload,
            answer=answer,
            result=result,
        )
        target_path.write_text(content, encoding="utf-8")
        return {
            "filename": filename,
            "path": str(target_path),
            "format": "markdown",
            "content": content,
        }

    def _build_design_intermediate_markdown(
        self,
        *,
        payload: dict[str, Any],
        answer: dict[str, Any],
        result: dict[str, Any],
    ) -> str:
        model_raw_output = str(answer.get("answer") or "")
        structured_view = {
            "title": result.get("title", ""),
            "inputQuestion": result.get("inputQuestion", ""),
            "project": result.get("project", ""),
            "outputType": result.get("outputType", ""),
            "outputTypeLabel": result.get("outputTypeLabel", ""),
            "granularity": result.get("granularity", ""),
            "evidenceLevel": result.get("evidenceLevel", ""),
            "structuredSource": result.get("structuredSource", ""),
            "pipelineVersion": result.get("pipelineVersion", ""),
            "pipelineSteps": result.get("pipelineSteps", []),
            "functionList": result.get("functionList", []),
            "useCases": result.get("useCases", []),
            "moduleSuggestions": result.get("moduleSuggestions", []),
            "risks": result.get("risks", []),
            "nextActions": result.get("nextActions", []),
            "diagram": result.get("diagram", ""),
            "citations": result.get("citations", []),
            "qualityChecks": result.get("qualityChecks", {}),
            "queryDesigner": result.get("queryDesigner", {}),
            "retriever": result.get("retriever", {}),
            "evidenceCollector": result.get("evidenceCollector", {}),
            "answerGenerator": result.get("answerGenerator", {}),
            "validator": result.get("validator", {}),
            "missingInformation": result.get("missingInformation", []),
            "implementationSuggestions": result.get("implementationSuggestions", []),
            "uncertainPoints": result.get("uncertainPoints", []),
        }
        metadata = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "scene": "design",
            "query": str(payload.get("query") or "").strip(),
            "project": str(payload.get("project") or "").strip(),
            "module": str(payload.get("module") or "").strip(),
            "focus": str(payload.get("focus") or "").strip(),
            "structured_source": result.get("structuredSource", ""),
            "evidence_level": result.get("evidenceLevel", ""),
        }
        model_output_stats = {
            "character_count": len(model_raw_output),
            "non_whitespace_character_count": len("".join(model_raw_output.split())),
            "line_count": len(model_raw_output.splitlines()) if model_raw_output else 0,
            "use_case_count": len(result.get("useCases") or []),
            "function_count": len(result.get("functionList") or []),
            "module_suggestion_count": len(result.get("moduleSuggestions") or []),
        }

        sections = [
            "# Design Intermediate Document",
            "",
            "## Metadata",
            "```json",
            json.dumps(metadata, ensure_ascii=False, indent=2),
            "```",
            "",
            "## Structured Design Output",
            "```json",
            json.dumps(structured_view, ensure_ascii=False, indent=2),
            "```",
            "",
            "## Model Raw Output Stats",
            "```json",
            json.dumps(model_output_stats, ensure_ascii=False, indent=2),
            "```",
            "",
            "## Model Raw Output Text",
            "```text",
            model_raw_output or "[empty]",
            "```",
            "",
            "## Backend Raw Design Response",
            "```json",
            json.dumps(answer, ensure_ascii=False, indent=2),
            "```",
        ]
        return "\n".join(sections).strip() + "\n"

    def _slugify_filename(self, value: str) -> str:
        lowered = value.lower()
        slug = re.sub(r"[^a-z0-9]+", "-", lowered)
        return slug.strip("-")

    def _build_scene_context(self, scene: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "scene": scene,
            "project": (payload.get("project") or "").strip(),
            "role": (payload.get("role") or "").strip(),
            "module": (payload.get("module") or "").strip(),
            "focus": (payload.get("focus") or "").strip(),
        }

    def _build_citations(self, hits: list[dict[str, Any]]) -> list[dict[str, str]]:
        citations = []
        for item in hits[:5]:
            metadata = item.get("metadata", {})
            source = metadata.get("source_name") or "知识库片段"
            snippet = item.get("content", "").strip().replace("\n", " ")
            score = float(item.get("score") or 0)
            citations.append(
                {
                    "id": item.get("id", ""),
                    "title": source,
                    "documentTitle": source,
                    "documentId": item.get("document_id", ""),
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
        project = (payload.get("project") or "").strip() or "当前项目"
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

        module_name = (payload.get("module") or "").strip() or "目标模块"
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
