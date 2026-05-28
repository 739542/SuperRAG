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
        return {
            "queries": queries[:3] or [query],
            "reason": str(payload.get("reason") or fallback["reason"]).strip() or fallback["reason"],
        }

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
            uncertainty.append("Unsupported claims: " + "; ".join(validation["unsupported_claims"][:3]))
        if evidence_bundle.get("missing_information"):
            uncertainty.extend(evidence_bundle["missing_information"][:2])
        return {
            "conclusion": answer_bundle.get("answer", ""),
            "evidence": "\n".join(evidence_lines) if evidence_lines else "No grounded evidence was extracted.",
            "suggestion": "\n".join(answer_bundle.get("implementation_suggestions", []))
            or "Review the cited documents before treating this as a final conclusion.",
            "uncertainty": "\n".join(uncertainty) if uncertainty else "No major uncertainty was detected in the retrieved evidence.",
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
                "missing_information": [f"No evidence was found in the current knowledge base for: {query}"],
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
            missing_information.append("Retrieved chunks have low relevance scores; key details may still be missing.")
        if len(hits) < 2:
            missing_information.append("Only a small amount of supporting evidence was found.")
        return {
            "evidence": evidence,
            "missing_information": missing_information,
        }

    def _mock_structured_answer(self, *, query: str, evidence_bundle: dict[str, Any]) -> dict[str, Any]:
        evidence = evidence_bundle.get("evidence", [])
        if not evidence:
            return {
                "answer": "I could not find grounded project evidence for this question in the current knowledge base.",
                "implementation_suggestions": [
                    "Import the relevant requirement, design, code, or interface document before answering again."
                ],
                "evidence_mapping": [],
                "uncertain_points": evidence_bundle.get("missing_information", []) or ["Evidence is missing."],
                "key_claims": ["Grounded evidence is currently missing for this question."],
            }

        summary_lines = [
            f"{item['source']} mentions {item['content'][:100]}{'...' if len(item['content']) > 100 else ''}"
            for item in evidence[:3]
        ]
        evidence_mapping = [
            {
                "claim": f"Evidence item {index + 1} is relevant to the user's question.",
                "evidence": [f"{item['source']}#{item['section']}"],
            }
            for index, item in enumerate(evidence[:3])
        ]
        return {
            "answer": "Based on the retrieved project evidence, the most relevant findings are:\n- " + "\n- ".join(summary_lines),
            "implementation_suggestions": [
                "Treat the cited document content as confirmed facts.",
                "Treat any uncited implementation idea as an optional suggestion that still needs review.",
            ],
            "evidence_mapping": evidence_mapping,
            "uncertain_points": evidence_bundle.get("missing_information", []),
            "key_claims": [item["claim"] for item in evidence_mapping],
        }

    def _mock_task_answer(self, *, query: str, evidence_bundle: dict[str, Any]) -> str:
        evidence = evidence_bundle.get("evidence", [])
        if not evidence:
            return (
                "No grounded project evidence was found, so a task-specific answer cannot be generated reliably.\n\n"
                f"Question: {query}"
            )
        lines = [f"- {item['source']}#{item['section']}: {item['content']}" for item in evidence[:4]]
        return "The following evidence was retrieved for the task:\n" + "\n".join(lines)

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
            unsupported_claims.append("The question could not be answered from grounded evidence.")
        return {
            "valid_claims": valid_claims,
            "unsupported_claims": unsupported_claims,
            "uncertain_claims": uncertain_claims,
            "final_revision_advice": "Keep only evidence-backed conclusions as facts and move the rest into uncertainty notes.",
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
    ) -> str:
        payload = {"model": model_name, "messages": messages, "temperature": temperature}
        headers = {
            "Authorization": f"Bearer {self._settings.model_api_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=self._settings.model_timeout_seconds) as client:
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
