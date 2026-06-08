from __future__ import annotations

import re
from pathlib import Path
from typing import Any


class GeneralQAPipeline:
    version = "aucmr-general-qa-pipeline-v2"

    _DOCUMENT_LIST_PATTERNS = [
        r"当前知识库.*(包含|收录|有|已有|里有).*(文档|文件|资料)",
        r"(已上传|已入库).*(文档|文件|资料)",
        r"(文档|文件).*(列表|清单)",
        r"(知识库|库里).*(有哪些|有哪几个|有几个).*(文档|文件|资料)",
        r"(包含|收录).*(哪些|哪几个|什么).*(文档|文件|资料)",
    ]

    _DOCUMENT_SUMMARY_PATTERNS = [
        r".*(文档|文件|资料).*(包含|包括|讲了什么|主要内容|内容|章节|总结)",
        r".*(请总结|总结一下).*(文档|文件|资料)",
        r".*(项目书).*(包含|包括|讲了什么|主要内容|内容|章节|总结)",
    ]

    _MODULE_SUMMARY_PATTERNS = [
        r".*模块.*(有哪些内容|有什么内容|有哪些功能|包括哪些内容|讲了什么|规则|流程|权限)",
        r".*(发票|合同|回款|客户|商机).*(模块).*(内容|功能|规则|流程|权限)",
    ]

    _MODULE_ALIASES = {
        "发票": ["发票", "开票", "发票管理", "开票申请"],
        "合同": ["合同", "合同管理", "合同金额", "签约"],
        "回款": ["回款", "回款管理", "收款"],
        "客户": ["客户", "客户管理", "公海", "负责人", "团队成员"],
        "商机": ["商机", "商机管理", "阶段", "预计金额"],
    }

    def __init__(self, frontend_service: Any):
        self._frontend = frontend_service

    def run(self, *, payload: dict[str, Any], collection: dict[str, Any], query: str) -> dict[str, Any]:
        router = self._classify_general_query(query)
        if router["intent"] == "document_list":
            return self._build_document_list_result(collection=collection, query=query, router=router)
        if router["intent"] == "document_summary":
            return self._build_document_summary_result(collection=collection, query=query, router=router)
        if router["intent"] == "module_summary":
            return self._build_module_summary_result(payload=payload, collection=collection, query=query, router=router)
        return self._run_normal_rag(payload=payload, collection=collection, query=query, router=router)

    def _run_normal_rag(
        self,
        *,
        payload: dict[str, Any],
        collection: dict[str, Any],
        query: str,
        router: dict[str, Any],
    ) -> dict[str, Any]:
        scene_prompt = self._frontend._build_system_prompt("general", payload)
        scene_context = self._frontend._build_scene_context("general", payload)
        answer = self._frontend._chat_service.answer(
            collection_id=collection["id"],
            query=query,
            top_k=5,
            system_prompt=scene_prompt,
            scene="general",
            context=scene_context,
        )
        citations = answer.get("citations", [])
        structured_answer = self._build_structured_answer(
            query=query,
            collection=collection,
            payload=payload,
            answer=answer,
            citations=citations,
        )
        uncertainty_items = structured_answer.get("uncertaintyItems", [])
        quality_assessment = self._frontend._build_scene_quality_assessment(
            "general",
            {
                "summary": structured_answer.get("conclusion", ""),
                "openQuestions": uncertainty_items,
            },
            citations,
        )
        pipeline = answer.get("pipeline", {}) or {}
        pipeline_steps = list(answer.get("pipeline_steps") or answer.get("pipelineSteps") or ["query_designer", "retriever", "evidence_collector", "answer_generator", "validator"])
        pipeline_trace_steps = list(pipeline.get("steps") or [])
        pipeline_trace_steps.append(
            {
                "name": "general_scene_compiler",
                "status": "completed",
                "output": {
                    "intent": router["intent"],
                    "resolvedCollection": {
                        "id": collection["id"],
                        "name": collection["name"],
                    },
                    "basisSummary": structured_answer.get("basisSummary", ""),
                    "evidenceItemCount": len(structured_answer.get("evidenceItems", [])),
                },
            }
        )
        return {
            "scene": "general",
            "source": "Dify Lite + General QA Pipeline",
            "title": f"{self._frontend._scene_label('general')}结果",
            "summary": structured_answer.get("conclusion", ""),
            "answer": structured_answer.get("conclusion", ""),
            "evidence": structured_answer.get("evidenceItems", []),
            "risks": uncertainty_items,
            "nextActions": structured_answer.get("followUpItems", []) or structured_answer.get("suggestionItems", []),
            "citations": citations,
            "evidenceLevel": answer.get("evidenceLevel", "low"),
            "structuredAnswer": structured_answer,
            "pipelineVersion": self.version,
            "pipelineSteps": [*pipeline_steps, "general_scene_compiler"],
            "pipeline": {
                "version": self.version,
                "steps": pipeline_trace_steps,
            },
            "queryDesigner": {
                **(answer.get("query_designer", {}) or {}),
                "intent": router["intent"],
            },
            "retriever": answer.get("retriever", {}),
            "evidenceCollector": answer.get("evidence_collector", {}),
            "answerGenerator": answer.get("answer_generator", {}),
            "validator": answer.get("validator", {}),
            "missingInformation": answer.get("missing_information", []),
            "implementationSuggestions": answer.get("implementation_suggestions", []),
            "uncertainPoints": uncertainty_items,
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
            "qualityAssessment": quality_assessment,
            "generationMode": "model" if answer.get("provider") == "openai-compatible" else "retrieval-fallback",
            "warning": answer.get("warning", ""),
        }

    def _classify_general_query(self, query: str) -> dict[str, Any]:
        if self._is_document_list_question(query):
            return {"intent": "document_list", "target": "", "reason": "matched_document_list"}
        module_target = self._extract_module_target(query)
        if module_target and self._is_module_summary_question(query):
            return {"intent": "module_summary", "target": module_target, "reason": "matched_module_summary"}
        document_target = self._extract_document_target(query)
        if document_target and self._is_document_summary_question(query):
            return {"intent": "document_summary", "target": document_target, "reason": "matched_document_summary"}
        return {"intent": "normal_rag", "target": "", "reason": "default_general_rag"}

    def _is_document_list_question(self, query: str) -> bool:
        text = str(query or "").strip()
        return any(re.search(pattern, text, re.IGNORECASE) for pattern in self._DOCUMENT_LIST_PATTERNS)

    def _is_document_summary_question(self, query: str) -> bool:
        text = str(query or "").strip()
        return any(re.search(pattern, text, re.IGNORECASE) for pattern in self._DOCUMENT_SUMMARY_PATTERNS)

    def _is_module_summary_question(self, query: str) -> bool:
        text = str(query or "").strip()
        return any(re.search(pattern, text, re.IGNORECASE) for pattern in self._MODULE_SUMMARY_PATTERNS)

    def _extract_document_target(self, query: str) -> str:
        text = self._normalize_lookup_text(query)
        replacements = [
            "当前知识库",
            "知识库",
            "文档",
            "文件",
            "资料",
            "里面",
            "中",
            "都",
            "哪些",
            "什么",
            "包含",
            "包括",
            "主要内容",
            "内容",
            "章节",
            "总结一下",
            "总结",
            "讲了什么",
            "讲什么",
            "请",
            "了",
            "一下",
        ]
        for value in replacements:
            text = text.replace(value, " ")
        text = re.sub(r"\s+", " ", text).strip()
        return text

    def _extract_module_target(self, query: str) -> str:
        text = str(query or "").strip()
        for module_name, aliases in self._MODULE_ALIASES.items():
            if any(alias in text for alias in aliases):
                return module_name
        match = re.search(r"([\u4e00-\u9fffA-Za-z0-9]{2,20})模块", text)
        if match:
            raw = match.group(1)
            raw = raw.replace("管理", "").strip()
            return raw[:10]
        return ""

    def _find_document_candidates(self, collection_id: str, target: str) -> list[dict[str, Any]]:
        target_text = self._normalize_lookup_text(target)
        target_tokens = self._split_lookup_tokens(target_text)
        documents = self._frontend._repository.list_documents(collection_id=collection_id)
        candidates: list[dict[str, Any]] = []
        for document in documents:
            title_text = self._normalize_lookup_text(document.get("title") or "")
            original_text = self._normalize_lookup_text(document.get("original_name") or "")
            filename_text = self._normalize_lookup_text(Path(document.get("filename") or "").stem)
            summary_text = self._normalize_lookup_text(document.get("summary") or "")
            haystack = " ".join([title_text, original_text, filename_text, summary_text]).strip()
            score = 0
            if target_text:
                if target_text == title_text or target_text == original_text:
                    score += 120
                if target_text and target_text in haystack:
                    score += 80
            if target_tokens:
                matched_tokens = sum(1 for token in target_tokens if token and token in haystack)
                score += matched_tokens * 18
                if matched_tokens == len(target_tokens):
                    score += 30
            if not score:
                continue
            candidates.append(
                {
                    "document": document,
                    "score": score,
                    "normalized": haystack,
                }
            )
        candidates.sort(key=lambda item: (item["score"], item["document"].get("chunk_count", 0)), reverse=True)
        return candidates

    def _build_document_list_result(self, *, collection: dict[str, Any], query: str, router: dict[str, Any]) -> dict[str, Any]:
        documents = [
            self._frontend._normalize_document(item)
            for item in self._frontend._repository.list_documents(collection_id=collection["id"])
        ]
        documents = sorted(documents, key=lambda item: str(item.get("title") or ""))
        conclusion_lines = [f"当前知识库 {collection['name']} 中可见的文档共有 {len(documents)} 个："]
        for index, item in enumerate(documents, start=1):
            conclusion_lines.append(f"{index}. {item.get('title') or '未命名文档'}")
        evidence_items = [
            {
                "title": item.get("title") or "未命名文档",
                "summary": (
                    f"类型：{item.get('type') or '未分类'}；"
                    f"项目：{item.get('project') or collection['name']}；"
                    f"状态：{item.get('status') or '已入库'}；"
                    f"chunk 数：{item.get('chunkCount') or 0}；"
                    f"创建时间：{item.get('createdAt') or '未知'}"
                ),
                "score": 1.0,
                "documentId": item.get("id", ""),
                "chunkId": "",
            }
            for item in documents[:8]
        ]
        citations = [
            {
                "id": item.get("id", ""),
                "title": item.get("title") or "未命名文档",
                "documentTitle": item.get("title") or "未命名文档",
                "documentId": item.get("id", ""),
                "chunkIndex": 0,
                "snippet": f"该文档当前存在于 {collection['name']} 的文档列表中。",
                "score": 1.0,
                "relevanceScore": 1.0,
                "vectorScore": 0.0,
                "lexicalScore": 0.0,
                "chunkId": "",
                "sourceName": item.get("title") or "未命名文档",
                "segmentId": "",
            }
            for item in documents[:5]
        ]
        structured_answer = {
            "conclusion": "\n".join(conclusion_lines),
            "basisSummary": f"本次回答直接基于 {collection['name']} 的实时 documents 列表生成，不经过大模型或 Retriever。",
            "evidence": "\n".join(f"{index + 1}. {item['title']}：{item['summary']}" for index, item in enumerate(evidence_items)),
            "evidenceItems": evidence_items,
            "suggestion": "",
            "suggestionItems": [],
            "followUpItems": [
                "是否需要继续说明每个文档分别覆盖什么主题？",
                "是否需要整理这些文档之间的上下游关系？",
                "是否需要筛出与权限或金额规则最相关的文档？",
            ],
            "uncertainty": "",
            "uncertaintyItems": [],
        }
        quality_assessment = self._frontend._build_scene_quality_assessment(
            "general",
            {
                "summary": structured_answer["conclusion"],
                "openQuestions": structured_answer["uncertaintyItems"],
            },
            citations,
        )
        return {
            "scene": "general",
            "source": "Dify Lite + General QA Pipeline",
            "title": "通用检索结果",
            "summary": structured_answer["conclusion"],
            "answer": structured_answer["conclusion"],
            "evidence": evidence_items,
            "risks": [],
            "nextActions": structured_answer["followUpItems"],
            "citations": citations,
            "evidenceLevel": "sufficient" if documents else "low",
            "structuredAnswer": structured_answer,
            "pipelineVersion": self.version,
            "pipelineSteps": ["question_router", "document_registry_lookup", "general_scene_compiler"],
            "pipeline": {
                "version": self.version,
                "steps": [
                    {
                        "name": "question_router",
                        "status": "completed",
                        "output": {
                            "intent": router["intent"],
                            "reason": router["reason"],
                            "resolvedCollection": {
                                "id": collection["id"],
                                "name": collection["name"],
                            },
                        },
                    },
                    {
                        "name": "document_registry_lookup",
                        "status": "completed",
                        "output": {
                            "documentCount": len(documents),
                            "collection": collection["name"],
                        },
                    },
                    {
                        "name": "general_scene_compiler",
                        "status": "completed",
                        "output": {
                            "query": query,
                            "evidenceItemCount": len(evidence_items),
                        },
                    },
                ],
            },
            "queryDesigner": {
                "queries": [query],
                "reason": "document list question routed to repository documents lookup",
            },
            "retriever": {
                "queries": [],
                "hit_count": len(documents),
                "hits": [],
                "warning": "",
                "mode": "bypassed",
            },
            "evidenceCollector": {
                "evidence": evidence_items,
                "missing_information": [],
            },
            "answerGenerator": {
                "provider": "document-registry",
                "raw_answer": structured_answer["conclusion"],
                "fallback_used": False,
            },
            "validator": {
                "valid_claims": [f"当前知识库可见文档数量：{len(documents)}"],
                "unsupported_claims": [],
                "uncertain_claims": [],
                "final_revision_advice": "当前结果来自 documents 列表接口，可直接用于文档清单确认。",
                "qualityAssessment": quality_assessment,
            },
            "missingInformation": [],
            "implementationSuggestions": [],
            "uncertainPoints": [],
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
            "qualityAssessment": quality_assessment,
            "generationMode": "document-registry",
        }

    def _build_document_summary_result(self, *, collection: dict[str, Any], query: str, router: dict[str, Any]) -> dict[str, Any]:
        candidates = self._find_document_candidates(collection["id"], router["target"])
        visible_documents = self._frontend._repository.list_documents(collection_id=collection["id"])
        if not candidates:
            visible_titles = [item.get("title") or item.get("original_name") or "未命名文档" for item in visible_documents[:8]]
            return self._build_simple_result(
                collection=collection,
                query=query,
                generation_mode="document-registry-summary",
                conclusion=(
                    f"在当前知识库 {collection['name']} 中未找到与“{router['target']}”明确匹配的目标文档。"
                    + (f" 当前可见文档包括：{'、'.join(visible_titles)}。" if visible_titles else "")
                ),
                basis_summary="本次回答先执行了确定性文档匹配，但没有命中目标文档，因此没有进入通用 RAG。",
                evidence_items=[
                    {
                        "title": item.get("title") or item.get("original_name") or "未命名文档",
                        "summary": f"项目：{item.get('project') or collection['name']}；类型：{item.get('doc_type') or '未分类'}",
                        "score": 0.2,
                        "documentId": item.get("id", ""),
                        "chunkId": "",
                    }
                    for item in visible_documents[:5]
                ],
                follow_up_items=[
                    "是否需要指定更准确的文档名称？",
                    "是否需要先查看当前知识库中的文档清单？",
                ],
                pipeline_steps=[
                    {
                        "name": "question_router",
                        "status": "completed",
                        "output": {
                            "intent": router["intent"],
                            "target": router["target"],
                            "resolvedCollection": {
                                "id": collection["id"],
                                "name": collection["name"],
                            },
                        },
                    },
                    {
                        "name": "document_matcher",
                        "status": "completed",
                        "output": {
                            "target": router["target"],
                            "candidateCount": 0,
                        },
                    },
                ],
                query_designer={"queries": [query], "reason": "deterministic document matcher"},
                retriever={"queries": [], "hit_count": 0, "hits": [], "warning": "", "mode": "bypassed"},
                answer_generator={"provider": "document-registry-summary", "raw_answer": "", "fallback_used": False},
                validator={
                    "valid_claims": [],
                    "unsupported_claims": [],
                    "uncertain_claims": [f"未找到目标文档：{router['target']}"],
                    "final_revision_advice": "请补充更准确的文档名称，或先查看当前知识库文档列表。",
                },
            )

        if len(candidates) > 1 and candidates[0]["score"] - candidates[1]["score"] <= 8:
            return self._build_simple_result(
                collection=collection,
                query=query,
                generation_mode="document-registry-summary",
                conclusion=(
                    f"围绕“{router['target']}”命中了多个可能文档，请进一步指定。"
                ),
                basis_summary="本次回答先执行了确定性文档匹配，但候选文档分数接近，系统未自动选择。",
                evidence_items=[
                    {
                        "title": item["document"].get("title") or item["document"].get("original_name") or "未命名文档",
                        "summary": f"匹配分数：{item['score']}；项目：{item['document'].get('project') or collection['name']}",
                        "score": float(item["score"]),
                        "documentId": item["document"].get("id", ""),
                        "chunkId": "",
                    }
                    for item in candidates[:5]
                ],
                follow_up_items=[
                    "是否需要指定完整文档名后再继续？",
                    "是否需要先查看这些候选文档的文档列表？",
                ],
                pipeline_steps=[
                    {
                        "name": "question_router",
                        "status": "completed",
                        "output": {
                            "intent": router["intent"],
                            "target": router["target"],
                            "resolvedCollection": {
                                "id": collection["id"],
                                "name": collection["name"],
                            },
                        },
                    },
                    {
                        "name": "document_matcher",
                        "status": "completed",
                        "output": {
                            "target": router["target"],
                            "candidateCount": len(candidates),
                            "topScores": [item["score"] for item in candidates[:3]],
                        },
                    },
                ],
                query_designer={"queries": [query], "reason": "deterministic document matcher"},
                retriever={"queries": [], "hit_count": 0, "hits": [], "warning": "", "mode": "bypassed"},
                answer_generator={"provider": "document-registry-summary", "raw_answer": "", "fallback_used": False},
                validator={
                    "valid_claims": [],
                    "unsupported_claims": [],
                    "uncertain_claims": ["命中了多个候选文档，尚未确定唯一目标文档。"],
                    "final_revision_advice": "请补充更完整的文档名称，避免误匹配。",
                },
            )

        return self._build_document_based_result(
            collection=collection,
            query=query,
            document=candidates[0]["document"],
            generation_mode="document-summary",
            query_designer={"queries": [query], "reason": "deterministic document matcher"},
            retriever={"queries": [], "hit_count": 0, "hits": [], "warning": "", "mode": "bypassed"},
            pipeline_steps=[
                {
                    "name": "question_router",
                    "status": "completed",
                    "output": {
                        "intent": router["intent"],
                        "target": router["target"],
                        "resolvedCollection": {
                            "id": collection["id"],
                            "name": collection["name"],
                        },
                    },
                },
                {
                    "name": "document_matcher",
                    "status": "completed",
                    "output": {
                        "target": router["target"],
                        "matchedDocument": candidates[0]["document"].get("title") or candidates[0]["document"].get("original_name") or "",
                        "score": candidates[0]["score"],
                    },
                },
            ],
        )

    def _build_module_summary_result(
        self,
        *,
        payload: dict[str, Any],
        collection: dict[str, Any],
        query: str,
        router: dict[str, Any],
    ) -> dict[str, Any]:
        expanded_queries = self._build_module_expanded_queries(query=query, module_target=router["target"])
        retrieval = self._frontend._retrieval_service.retrieve_many(
            collection_id=collection["id"],
            queries=expanded_queries,
            top_k=6,
        )
        candidates = self._find_document_candidates(collection["id"], f"{router['target']}管理模块")
        if not candidates:
            candidates = self._find_document_candidates(collection["id"], router["target"])

        if candidates:
            top_document = candidates[0]["document"]
            return self._build_document_based_result(
                collection=collection,
                query=query,
                document=top_document,
                generation_mode="document-summary",
                query_designer={
                    "queries": expanded_queries,
                    "reason": "deterministic module expansion",
                },
                retriever={
                    **retrieval,
                    "queries": expanded_queries,
                    "mode": "deterministic_query_expansion",
                },
                pipeline_steps=[
                    {
                        "name": "question_router",
                        "status": "completed",
                        "output": {
                            "intent": router["intent"],
                            "target": router["target"],
                            "resolvedCollection": {
                                "id": collection["id"],
                                "name": collection["name"],
                            },
                        },
                    },
                    {
                        "name": "deterministic_query_expansion",
                        "status": "completed",
                        "output": {
                            "queries": expanded_queries,
                        },
                    },
                    {
                        "name": "document_matcher",
                        "status": "completed",
                        "output": {
                            "matchedDocument": top_document.get("title") or top_document.get("original_name") or "",
                            "candidateCount": len(candidates),
                        },
                    },
                ],
                retrieval_hits=retrieval.get("hits", []),
            )

        hits = retrieval.get("hits", [])
        if hits:
            document = self._resolve_hit_document(hits[0])
            if document:
                return self._build_document_based_result(
                    collection=collection,
                    query=query,
                    document=document,
                    generation_mode="document-summary",
                    query_designer={
                        "queries": expanded_queries,
                        "reason": "deterministic module expansion",
                    },
                    retriever={
                        **retrieval,
                        "queries": expanded_queries,
                        "mode": "deterministic_query_expansion",
                    },
                    pipeline_steps=[
                        {
                            "name": "question_router",
                            "status": "completed",
                            "output": {
                                "intent": router["intent"],
                                "target": router["target"],
                                "resolvedCollection": {
                                    "id": collection["id"],
                                    "name": collection["name"],
                                },
                            },
                        },
                        {
                            "name": "deterministic_query_expansion",
                            "status": "completed",
                            "output": {
                                "queries": expanded_queries,
                            },
                        },
                    ],
                    retrieval_hits=hits,
                )

        return self._build_simple_result(
            collection=collection,
            query=query,
            generation_mode="retrieval-fallback",
            conclusion=f"当前知识库 {collection['name']} 中暂未检索到与“{router['target']}模块”相关的证据。",
            basis_summary="本次回答已先执行模块问题的确定性 query expansion，但 expanded queries 仍未命中结果。",
            evidence_items=[],
            follow_up_items=[
                "是否需要先确认当前知识库中是否已导入该模块文档？",
                "是否需要查看本次尝试过的 expanded queries？",
            ],
            pipeline_steps=[
                {
                    "name": "question_router",
                    "status": "completed",
                    "output": {
                        "intent": router["intent"],
                        "target": router["target"],
                        "resolvedCollection": {
                            "id": collection["id"],
                            "name": collection["name"],
                        },
                    },
                },
                {
                    "name": "deterministic_query_expansion",
                    "status": "completed",
                    "output": {
                        "queries": expanded_queries,
                    },
                },
            ],
            query_designer={"queries": expanded_queries, "reason": "deterministic module expansion"},
            retriever={**retrieval, "queries": expanded_queries, "mode": "deterministic_query_expansion"},
            answer_generator={"provider": "retrieval-fallback", "raw_answer": "", "fallback_used": True},
            validator={
                "valid_claims": [],
                "unsupported_claims": [],
                "uncertain_claims": [f"未检索到模块证据：{router['target']}"],
                "final_revision_advice": "请确认模块文档是否已上传，或尝试指定更完整的模块名称。",
            },
        )

    def _build_module_expanded_queries(self, *, query: str, module_target: str) -> list[str]:
        aliases = self._MODULE_ALIASES.get(module_target, [module_target])
        expanded = [
            query,
            f"{module_target}管理模块 主要内容 功能 规则 流程 权限",
            f"{module_target}模块 业务规则 状态 流程 负责人 团队成员",
        ]
        if module_target == "发票":
            expanded.extend(
                [
                    "发票管理 开票申请 合同金额 开票金额 回款 审批 权限 业务规则 状态 流程",
                    "发票管理模块 合同 客户 回款 数据联动 校验 规则",
                ]
            )
        elif module_target == "合同":
            expanded.extend(
                [
                    "合同管理 合同金额 客户 商机 回款 发票 审批 业务规则 状态 流程",
                    "合同管理模块 负责人 团队成员 权限 金额 关联规则",
                ]
            )
        elif module_target == "回款":
            expanded.extend(
                [
                    "回款管理 回款记录 合同 客户 金额 状态 审批 业务规则",
                    "回款管理模块 发票 合同 数据联动 校验 规则",
                ]
            )
        elif module_target == "客户":
            expanded.extend(
                [
                    "客户管理 客户信息 负责人 团队成员 公海 权限 跟进 商机 规则",
                    "客户管理模块 字段 唯一 必填 权限 公海 跟进 规则",
                ]
            )
        elif module_target == "商机":
            expanded.extend(
                [
                    "商机管理 客户 阶段 预计金额 负责人 合同 跟进 状态 规则",
                    "商机管理模块 权限 阶段 流程 合同 转化 规则",
                ]
            )
        expanded.extend(aliases)
        return self._dedupe_texts(expanded)[:5]

    def _build_document_based_result(
        self,
        *,
        collection: dict[str, Any],
        query: str,
        document: dict[str, Any],
        generation_mode: str,
        query_designer: dict[str, Any],
        retriever: dict[str, Any],
        pipeline_steps: list[dict[str, Any]],
        retrieval_hits: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        normalized_document = self._frontend._normalize_document(document)
        chunks = self._frontend._repository.get_chunks_for_document(document["id"])
        citations = self._build_document_citations(document=document, chunks=chunks, retrieval_hits=retrieval_hits or [])
        evidence_items = self._build_evidence_items(citations)
        overview_items = self._summarize_document_chunks(document=document, chunks=chunks, query=query)
        key_snippets = [item.get("snippet") or "" for item in citations[:3] if str(item.get("snippet") or "").strip()]
        conclusion_lines = [f"《{normalized_document['title']}》当前可见的主要内容包括："]
        conclusion_lines.extend(f"{index + 1}. {item}" for index, item in enumerate(overview_items))
        if not overview_items:
            conclusion_lines.append("1. 当前已匹配到目标文档，但还没有抽取出足够稳定的内容概览。")
        structured_answer = {
            "conclusion": "\n".join(conclusion_lines),
            "basisSummary": (
                f"本次回答直接基于 {collection['name']} 中的 {normalized_document['title']} 生成。"
                f" 文档类型：{normalized_document['type']}；chunk 数：{normalized_document['chunkCount']}。"
            ),
            "evidence": "\n".join(f"{index + 1}. {item['title']}：{item['summary']}" for index, item in enumerate(evidence_items)),
            "evidenceItems": evidence_items,
            "suggestion": "",
            "suggestionItems": [],
            "followUpItems": self._build_document_followups(document=normalized_document, query=query),
            "uncertainty": "",
            "uncertaintyItems": [],
        }
        quality_assessment = self._frontend._build_scene_quality_assessment(
            "general",
            {
                "summary": structured_answer["conclusion"],
                "openQuestions": structured_answer["uncertaintyItems"],
            },
            citations,
        )
        pipeline_steps = [
            *pipeline_steps,
            {
                "name": "document_chunk_summary",
                "status": "completed",
                "output": {
                    "documentId": document["id"],
                    "documentTitle": normalized_document["title"],
                    "chunkCount": len(chunks),
                    "summaryItemCount": len(overview_items),
                },
            },
            {
                "name": "general_scene_compiler",
                "status": "completed",
                "output": {
                    "generationMode": generation_mode,
                    "citationCount": len(citations),
                },
            },
        ]
        return {
            "scene": "general",
            "source": "Dify Lite + General QA Pipeline",
            "title": "通用检索结果",
            "summary": structured_answer["conclusion"],
            "answer": structured_answer["conclusion"],
            "evidence": evidence_items,
            "risks": [],
            "nextActions": structured_answer["followUpItems"],
            "citations": citations,
            "evidenceLevel": "sufficient" if citations else "partial",
            "structuredAnswer": structured_answer,
            "pipelineVersion": self.version,
            "pipelineSteps": [step["name"] for step in pipeline_steps],
            "pipeline": {
                "version": self.version,
                "steps": pipeline_steps,
            },
            "queryDesigner": query_designer,
            "retriever": retriever,
            "evidenceCollector": {
                "evidence": evidence_items,
                "missing_information": [],
            },
            "answerGenerator": {
                "provider": generation_mode,
                "raw_answer": structured_answer["conclusion"],
                "key_snippets": key_snippets,
                "fallback_used": False,
            },
            "validator": {
                "valid_claims": overview_items[:5],
                "unsupported_claims": [],
                "uncertain_claims": [],
                "final_revision_advice": "当前结果来自确定性文档摘要，可继续结合原文 chunk 做人工核对。",
                "qualityAssessment": quality_assessment,
            },
            "missingInformation": [],
            "implementationSuggestions": [],
            "uncertainPoints": [],
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
            "qualityAssessment": quality_assessment,
            "generationMode": generation_mode,
            "warning": "",
        }

    def _build_simple_result(
        self,
        *,
        collection: dict[str, Any],
        query: str,
        generation_mode: str,
        conclusion: str,
        basis_summary: str,
        evidence_items: list[dict[str, Any]],
        follow_up_items: list[str],
        pipeline_steps: list[dict[str, Any]],
        query_designer: dict[str, Any],
        retriever: dict[str, Any],
        answer_generator: dict[str, Any],
        validator: dict[str, Any],
    ) -> dict[str, Any]:
        citations = [
            {
                "id": item.get("documentId") or item.get("title") or "",
                "title": item.get("title") or "知识库条目",
                "documentTitle": item.get("title") or "知识库条目",
                "documentId": item.get("documentId") or "",
                "chunkIndex": 0,
                "snippet": item.get("summary") or "",
                "score": float(item.get("score") or 0),
                "relevanceScore": float(item.get("score") or 0),
                "vectorScore": 0.0,
                "lexicalScore": float(item.get("score") or 0),
                "chunkId": item.get("chunkId") or "",
                "sourceName": item.get("title") or "知识库条目",
                "segmentId": item.get("chunkId") or "",
            }
            for item in evidence_items[:5]
        ]
        structured_answer = {
            "conclusion": conclusion,
            "basisSummary": basis_summary,
            "evidence": "\n".join(f"{index + 1}. {item['title']}：{item['summary']}" for index, item in enumerate(evidence_items)),
            "evidenceItems": evidence_items,
            "suggestion": "",
            "suggestionItems": [],
            "followUpItems": follow_up_items,
            "uncertainty": "\n".join(validator.get("uncertain_claims", [])),
            "uncertaintyItems": validator.get("uncertain_claims", []),
        }
        quality_assessment = self._frontend._build_scene_quality_assessment(
            "general",
            {
                "summary": conclusion,
                "openQuestions": structured_answer["uncertaintyItems"],
            },
            citations,
        )
        pipeline_steps = [
            *pipeline_steps,
            {
                "name": "general_scene_compiler",
                "status": "completed",
                "output": {
                    "generationMode": generation_mode,
                    "resolvedCollection": {
                        "id": collection["id"],
                        "name": collection["name"],
                    },
                },
            },
        ]
        return {
            "scene": "general",
            "source": "Dify Lite + General QA Pipeline",
            "title": "通用检索结果",
            "summary": structured_answer["conclusion"],
            "answer": structured_answer["conclusion"],
            "evidence": evidence_items,
            "risks": structured_answer["uncertaintyItems"],
            "nextActions": follow_up_items,
            "citations": citations,
            "evidenceLevel": "low" if not citations else "partial",
            "structuredAnswer": structured_answer,
            "pipelineVersion": self.version,
            "pipelineSteps": [step["name"] for step in pipeline_steps],
            "pipeline": {
                "version": self.version,
                "steps": pipeline_steps,
            },
            "queryDesigner": query_designer,
            "retriever": retriever,
            "evidenceCollector": {
                "evidence": evidence_items,
                "missing_information": validator.get("uncertain_claims", []),
            },
            "answerGenerator": answer_generator,
            "validator": {
                **validator,
                "qualityAssessment": quality_assessment,
            },
            "missingInformation": validator.get("uncertain_claims", []),
            "implementationSuggestions": [],
            "uncertainPoints": validator.get("uncertain_claims", []),
            "collection": {
                "id": collection["id"],
                "name": collection["name"],
            },
            "qualityAssessment": quality_assessment,
            "generationMode": generation_mode,
            "warning": "",
        }

    def _build_document_citations(
        self,
        *,
        document: dict[str, Any],
        chunks: list[dict[str, Any]],
        retrieval_hits: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        document_title = document.get("title") or document.get("original_name") or document.get("filename") or "未命名文档"
        ranked_chunks: list[dict[str, Any]] = []
        seen_chunk_ids: set[str] = set()
        for hit in retrieval_hits:
            if hit.get("document_id") != document.get("id"):
                continue
            chunk = self._frontend._repository.get_chunk(hit.get("id", ""))
            if not chunk:
                continue
            if chunk["id"] in seen_chunk_ids:
                continue
            seen_chunk_ids.add(chunk["id"])
            ranked_chunks.append(
                {
                    **chunk,
                    "_score": float(hit.get("score") or 0),
                }
            )
        if len(ranked_chunks) < 5:
            for chunk in chunks:
                if chunk["id"] in seen_chunk_ids:
                    continue
                seen_chunk_ids.add(chunk["id"])
                ranked_chunks.append(
                    {
                        **chunk,
                        "_score": max(0.1, 1.0 - (len(ranked_chunks) * 0.08)),
                    }
                )
                if len(ranked_chunks) >= 5:
                    break
        citations: list[dict[str, Any]] = []
        for chunk in ranked_chunks[:5]:
            snippet = self._truncate_text(
                self._extract_chunk_snippet(chunk.get("cleaned_content") or chunk.get("content") or ""),
                220,
            )
            citations.append(
                {
                    "id": chunk.get("id", ""),
                    "title": document_title,
                    "documentTitle": document_title,
                    "documentId": document.get("id", ""),
                    "chunkIndex": int(chunk.get("position", 0) or 0) + 1,
                    "snippet": snippet,
                    "score": float(chunk.get("_score") or 0),
                    "relevanceScore": float(chunk.get("_score") or 0),
                    "vectorScore": 0.0,
                    "lexicalScore": float(chunk.get("_score") or 0),
                    "chunkId": chunk.get("id", ""),
                    "sourceName": document_title,
                    "segmentId": chunk.get("id", ""),
                }
            )
        return citations

    def _summarize_document_chunks(self, *, document: dict[str, Any], chunks: list[dict[str, Any]], query: str) -> list[str]:
        toc_headings = self._extract_toc_headings(chunks)
        if toc_headings:
            return toc_headings

        headings: list[str] = []
        snippets: list[str] = []
        for chunk in chunks:
            text = str(chunk.get("cleaned_content") or chunk.get("content") or "").strip()
            if not text:
                continue
            for line in text.splitlines():
                candidate = line.strip().lstrip("#").strip()
                if not candidate:
                    continue
                if (line.strip().startswith("#") or re.match(r"^\d+([.、)]|\s)", candidate)) and candidate not in headings:
                    headings.append(candidate[:80])
            for sentence in re.split(r"[。！？；\n]+", text):
                candidate = re.sub(r"\s+", " ", sentence).strip(" -:：;；,，")
                if len(candidate) < 18:
                    continue
                if candidate not in snippets:
                    snippets.append(candidate[:120])

        if headings:
            return headings
        if snippets:
            return snippets
        return [f"{document.get('title') or document.get('original_name') or '目标文档'} 已匹配成功，但当前未提取到稳定摘要。"]

    def _extract_toc_headings(self, chunks: list[dict[str, Any]]) -> list[str]:
        headings: list[str] = []
        for chunk in chunks[:3]:
            text = str(chunk.get("cleaned_content") or chunk.get("content") or "")
            if "目录" not in text and "TOC" not in text.upper():
                continue
            for match in re.findall(r"([一二三四五六七八九十]+、[^\n]{2,40})", text):
                candidate = re.sub(r"\s+", " ", match).strip()
                candidate = candidate.split("PAGEREF", 1)[0].strip(" -:：;；,，")
                if len(candidate) < 4:
                    continue
                if candidate not in headings:
                    headings.append(candidate)
        return headings

    def _build_document_followups(self, *, document: dict[str, Any], query: str) -> list[str]:
        text = f"{query} {document.get('title') or ''}"
        if re.search(r"客户|商机|合同|回款|发票|CRM", text, re.IGNORECASE):
            return [
                "是否需要继续整理该模块的业务规则和状态流转？",
                "是否需要进一步查看负责人、团队成员、权限相关内容？",
                "是否需要转入需求设计辅助生成结构化结果？",
            ]
        return [
            "是否需要继续查看该文档的关键原文片段？",
            "是否需要把该文档内容整理成结构化功能清单？",
        ]

    def _resolve_hit_document(self, hit: dict[str, Any]) -> dict[str, Any] | None:
        document_id = hit.get("document_id") or ""
        if document_id:
            document = self._frontend._repository.get_document(document_id)
            if document:
                return document
        source_name = (hit.get("metadata") or {}).get("source_name") or ""
        if source_name:
            return self._frontend._repository.find_document_by_source_name(source_name)
        return None

    def _build_structured_answer(
        self,
        *,
        query: str,
        collection: dict[str, Any],
        payload: dict[str, Any],
        answer: dict[str, Any],
        citations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        backend_structured = answer.get("structured_answer") if isinstance(answer.get("structured_answer"), dict) else {}
        conclusion = str(backend_structured.get("conclusion") or answer.get("answer") or "").strip()
        evidence_items = self._build_evidence_items(citations)
        suggestion_items = self._dedupe_texts(
            [
                str(item).strip()
                for item in answer.get("implementation_suggestions", [])
                if str(item).strip()
            ]
        )
        follow_up_items = self._build_follow_up_questions(
            query=query,
            citations=citations,
            collection_name=collection["name"],
            project=self._frontend._payload_text(payload, "project"),
        )
        uncertainty_items = self._dedupe_texts(
            [
                *[str(item).strip() for item in answer.get("uncertain_points", []) if str(item).strip()],
                *[str(item).strip() for item in answer.get("missing_information", []) if str(item).strip()],
                *[
                    str(item).strip()
                    for item in (answer.get("validator", {}) or {}).get("unsupported_claims", [])
                    if str(item).strip()
                ],
                *[
                    str(item).strip()
                    for item in (answer.get("validator", {}) or {}).get("uncertain_claims", [])
                    if str(item).strip()
                ],
            ]
        )
        return {
            "conclusion": conclusion or "当前暂无明确结论。",
            "basisSummary": self._build_basis_summary(
                collection_name=collection["name"],
                citations=citations,
                evidence_level=str(answer.get("evidenceLevel") or "low"),
            ),
            "evidence": "\n".join(f"{index + 1}. {item['title']}：{item['summary']}" for index, item in enumerate(evidence_items)),
            "evidenceItems": evidence_items,
            "suggestion": "\n".join(suggestion_items),
            "suggestionItems": suggestion_items,
            "followUpItems": follow_up_items,
            "uncertainty": "\n".join(uncertainty_items),
            "uncertaintyItems": uncertainty_items,
        }

    def _build_basis_summary(self, *, collection_name: str, citations: list[dict[str, Any]], evidence_level: str) -> str:
        if not citations:
            return f"本次回答主要基于 {collection_name} 的检索结果整理，但当前没有返回可直接引用的证据片段。"
        grouped: dict[str, int] = {}
        for item in citations:
            title = str(item.get("documentTitle") or item.get("title") or item.get("sourceName") or "知识库片段").strip()
            grouped[title] = grouped.get(title, 0) + 1
        docs_text = "、".join(f"{title}（{count} 个片段）" for title, count in list(grouped.items())[:4])
        if evidence_level in {"sufficient", "high"}:
            status_text = "当前证据可支撑初步回答，但正式使用前仍建议核对原文。"
        elif evidence_level in {"partial", "medium"}:
            status_text = "当前证据部分可支撑回答，仍需结合原文确认关键细节。"
        else:
            status_text = "当前证据偏弱，正式使用前建议继续补充资料并人工复核。"
        return f"本次回答主要基于 {collection_name} 中的 {docs_text}。{status_text}"

    def _build_evidence_items(self, citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        items = []
        for citation in citations[:5]:
            items.append(
                {
                    "title": citation.get("documentTitle") or citation.get("title") or citation.get("sourceName") or "知识库片段",
                    "summary": str(citation.get("snippet") or citation.get("content") or "").strip() or "该文档命中当前问题相关证据。",
                    "score": float(citation.get("relevanceScore") or citation.get("score") or 0),
                    "documentId": citation.get("documentId") or "",
                    "chunkId": citation.get("chunkId") or citation.get("segmentId") or citation.get("id") or "",
                }
            )
        return items

    def _build_follow_up_questions(
        self,
        *,
        query: str,
        citations: list[dict[str, Any]],
        collection_name: str,
        project: str,
    ) -> list[str]:
        text = " ".join(
            [
                query,
                collection_name,
                project,
                *[
                    f"{item.get('documentTitle', '')} {item.get('snippet', '')}"
                    for item in citations[:6]
                ],
            ]
        )
        if re.search(r"客户|商机|合同|回款|发票|CRM", text, re.IGNORECASE):
            return [
                "是否需要继续说明这些模块之间的业务关系？",
                "是否需要整理权限、金额、状态流转相关规则？",
                "是否需要转入需求设计辅助生成结构化结果？",
            ]
        return [
            "是否需要继续查看相关文档原文？",
            "是否需要把当前结论整理成功能清单或流程说明？",
            "是否需要列出当前知识库中仍缺少哪些关键文档？",
        ]

    def _dedupe_texts(self, items: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            text = str(item or "").strip()
            if not text or text in seen:
                continue
            seen.add(text)
            result.append(text)
        return result

    def _normalize_lookup_text(self, value: str) -> str:
        text = Path(str(value or "")).stem.lower()
        text = re.sub(r"[()（）\[\]【】_./\\\-]+", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _split_lookup_tokens(self, value: str) -> list[str]:
        tokens = [item.strip() for item in re.split(r"\s+", value) if item.strip()]
        return [token for token in tokens if token not in {"文档", "文件", "资料", "内容", "总结"}]

    def _extract_chunk_snippet(self, text: str) -> str:
        cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
        if not cleaned:
            return ""
        parts = re.split(r"[。！？；]+", cleaned)
        snippets = [part.strip(" -:：;；,，") for part in parts if len(part.strip()) >= 18]
        if snippets:
            return snippets[0]
        return cleaned[:220]

    def _truncate_text(self, text: str, max_length: int) -> str:
        value = str(text or "").strip()
        if len(value) <= max_length:
            return value
        return value[: max_length - 1].rstrip() + "…"
