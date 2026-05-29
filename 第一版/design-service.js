/**
 * Design service adapter.
 *
 * The design assistant page should display structured results returned by the
 * backend. This adapter no longer fabricates functionList/useCases/modules on
 * the frontend.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getBackend() {
    if (!window.SuperRagBackend) {
      throw new Error("SuperRagBackend is not loaded");
    }
    return window.SuperRagBackend;
  }

  async function getDesignOptions() {
    const documents = await getDocumentsWithBackend();
    return {
      outputTypes: [
        "功能清单",
        "详细文本用例",
        "模块划分建议",
        "接口设计建议",
        "风险分析",
        "答辩说明稿",
      ],
      projects: uniqueValues([
        "企业知识助手系统",
        "新人培训平台",
        "任务交接管理模块",
        "需求设计辅助模块",
        ...documents.map((item) => item.project).filter(Boolean),
      ]),
      granularities: ["简要", "标准", "详细"],
    };
  }

  async function getDesignOutputs() {
    return [];
  }

  async function generateDesignOutput(payload = {}) {
    const raw = await getBackend().requestJson("/scenes/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: window.SuperRagConfig?.CHAT_API_TIMEOUT_MS || 90000,
      body: JSON.stringify({
        query: payload.inputQuestion || payload.question,
        project: payload.project || "",
        module: payload.outputType || "",
        focus: payload.granularity || "",
        user: "course-demo-user",
      }),
    });

    const result = mapSceneResultToDesignOutput(raw, payload);
    getBackend().appendHistoryRecord({
      id: result.id,
      title: result.title,
      sceneMode: "design",
      project: result.project,
      summary: result.inputQuestion,
      originalQuestion: result.inputQuestion,
      outputSummary: result.functionList.map((item) => item.description).join("\n"),
      citations: result.citations,
    });
    return clone(result);
  }

  function mapWorkflowDesignOutputToDesignOutput(raw = {}) {
    return normalizeBackendDesignOutput(raw, {
      inputQuestion: raw.inputQuestion || raw.input_question || raw.query || "",
      outputType: raw.outputType || raw.output_type || "",
      project: raw.project || raw.projectName || raw.project_name || "",
      granularity: raw.granularity || "",
    });
  }

  function mapSceneResultToDesignOutput(raw = {}, payload = {}) {
    const result = normalizeBackendDesignOutput(raw, payload);
    const hasStructuredFields =
      result.functionList.length ||
      result.useCases.length ||
      result.moduleSuggestions.length ||
      result.risks.length ||
      result.nextActions.length;

    if (!hasStructuredFields) {
      throw new Error("The backend did not return a structured design result.");
    }
    return result;
  }

  function normalizeBackendDesignOutput(raw = {}, payload = {}) {
    const functionList = toArray(raw.functionList || raw.function_list).map(mapFunctionItem);
    const useCases = toArray(raw.useCases || raw.use_cases).map(mapUseCaseItem);
    const moduleSuggestions = toArray(raw.moduleSuggestions || raw.module_suggestions).map(mapModuleItem);
    const risks = toArray(raw.risks || raw.riskItems || raw.risk_items).map(mapRiskItem);
    const nextActions = toArray(raw.nextActions || raw.next_actions || raw.actions).map(mapNextActionItem);
    const citations = toArray(raw.citations || raw.citationItems || raw.citationsDetail).map(mapCitationToEvidence);
    const evidenceLevel = mapEvidenceLevel(raw.evidenceLevel || raw.evidence_level || inferEvidenceLevel(citations));
    const qualityChecks = normalizeQualityChecks(raw.qualityChecks || raw.quality_checks || {}, evidenceLevel);
    const diagram = resolveDiagramSource(raw, {
      functionList,
      useCases,
      moduleSuggestions,
      inputQuestion: payload.inputQuestion || payload.question || raw.inputQuestion || raw.input_question || raw.query || "",
      title: raw.title || "",
    });

    return {
      id: raw.id || `design-${Date.now()}`,
      title: raw.title || "设计辅助输出",
      inputQuestion: payload.inputQuestion || payload.question || raw.inputQuestion || raw.input_question || raw.query || "",
      project: raw.project || raw.projectName || raw.project_name || raw.collection?.name || payload.project || "",
      outputType: raw.outputType || raw.output_type || payload.outputType || "详细文本用例",
      outputTypeLabel: raw.outputTypeLabel || raw.output_type_label || raw.outputType || raw.output_type || payload.outputType || "详细文本用例",
      granularity: raw.granularity || payload.granularity || "标准",
      createdAt: raw.createdAt || raw.created_at || nowText(),
      evidenceLevel,
      functionList,
      useCases,
      moduleSuggestions,
      risks,
      nextActions,
      citations,
      qualityChecks,
      diagram,
      pipelineVersion: raw.pipelineVersion || raw.pipeline_version || "",
      pipelineSteps: raw.pipelineSteps || raw.pipeline_steps || [],
      pipeline: raw.pipeline || {},
      queryDesigner: raw.queryDesigner || raw.query_designer || {},
      retriever: raw.retriever || raw.retrieval || {},
      evidenceCollector: raw.evidenceCollector || raw.evidence_collector || {},
      answerGenerator: raw.answerGenerator || raw.answer_generator || {},
      validator: raw.validator || {},
      structuredAnswer: raw.structuredAnswer || raw.structured_answer || {},
      missingInformation: raw.missingInformation || raw.missing_information || [],
      implementationSuggestions: raw.implementationSuggestions || raw.implementation_suggestions || [],
      uncertainPoints: raw.uncertainPoints || raw.uncertain_points || [],
      intermediateDocument: raw.intermediateDocument || raw.intermediate_document || null,
      structuredSource: raw.structuredSource || "backend",
      structuredFromBackend: raw.structuredFromBackend !== false,
    };
  }

  function mapFunctionItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        id: `F-${String(index + 1).padStart(3, "0")}`,
        name: raw,
        description: raw,
        priority: "medium",
        relatedDocument: "",
      };
    }

    return {
      id: raw.id || raw.functionId || raw.function_id || `F-${String(index + 1).padStart(3, "0")}`,
      name: raw.name || raw.functionName || raw.function_name || "Unnamed function",
      description: raw.description || raw.desc || raw.detail || "",
      priority: raw.priority || "medium",
      relatedDocument: raw.relatedDocument || raw.related_document || raw.documentTitle || raw.document_title || "",
    };
  }

  function mapUseCaseItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        id: `UC-${String(index + 1).padStart(3, "0")}`,
        name: raw,
        actor: "",
        preconditions: [],
        mainSuccessScenario: [raw],
        extensionScenarios: [],
        exceptionScenarios: [],
        postconditions: "",
      };
    }

    return {
      id: raw.id || raw.useCaseId || raw.use_case_id || `UC-${String(index + 1).padStart(3, "0")}`,
      name: raw.name || raw.useCaseName || raw.use_case_name || "Unnamed use case",
      actor: raw.actor || raw.participant || "",
      preconditions: toArray(raw.preconditions || raw.precondition),
      mainSuccessScenario: toArray(raw.mainSuccessScenario || raw.main_success_scenario || raw.mainFlow || raw.main_flow),
      extensionScenarios: toArray(raw.extensionScenarios || raw.extension_scenarios || raw.extensions),
      exceptionScenarios: toArray(raw.exceptionScenarios || raw.exception_scenarios || raw.exceptions),
      postconditions: raw.postconditions || raw.postcondition || "",
    };
  }

  function mapModuleItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        name: raw,
        responsibility: raw,
        input: [],
        output: [],
        dependencies: [],
      };
    }

    return {
      name: raw.name || raw.moduleName || raw.module_name || `Module ${index + 1}`,
      responsibility: raw.responsibility || raw.description || "",
      input: toArray(raw.input || raw.inputs),
      output: toArray(raw.output || raw.outputs),
      dependencies: toArray(raw.dependencies || raw.dependency),
    };
  }

  function mapRiskItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        description: raw,
        impact: "",
        supplement: "",
        confidence: index === 0 ? "medium" : "low",
        needsReview: true,
      };
    }

    return {
      description: raw.description || raw.riskDescription || raw.risk_description || "",
      impact: raw.impact || raw.scope || "",
      supplement: raw.supplement || raw.suggestedMaterial || raw.suggested_material || raw.suggestion || "",
      confidence: raw.confidence || "medium",
      needsReview: Boolean(raw.needsReview ?? raw.needs_review ?? true),
    };
  }

  function mapNextActionItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        action: raw,
        priority: index === 0 ? "high" : "medium",
        owner: "",
        dependentDocument: "",
        doneDefinition: "",
      };
    }

    return {
      action: raw.action || raw.title || "",
      priority: raw.priority || "medium",
      owner: raw.owner || raw.suggestedOwner || raw.suggested_owner || "",
      dependentDocument: raw.dependentDocument || raw.dependent_document || raw.documentTitle || raw.document_title || "",
      doneDefinition: raw.doneDefinition || raw.done_definition || raw.acceptanceCriteria || raw.acceptance_criteria || "",
    };
  }

  function mapCitationToEvidence(raw = {}) {
    return {
      id: raw.id || raw.segmentId || raw.segment_id || "",
      documentTitle: raw.documentTitle || raw.document_title || raw.title || "知识库片段",
      snippet: raw.snippet || raw.content || "",
      relevanceScore: Number(raw.relevanceScore ?? raw.relevance_score ?? raw.score ?? 0),
      page: raw.page || raw.pageNo || raw.page_no || "",
      segmentId: raw.segmentId || raw.segment_id || raw.id || "",
      chunkId: raw.chunkId || raw.chunk_id || raw.segmentId || raw.segment_id || raw.id || "",
      documentId: raw.documentId || raw.document_id || "",
      sourceName: raw.sourceName || raw.source_name || raw.documentTitle || raw.document_title || raw.title || "",
    };
  }

  function normalizeQualityChecks(raw = {}, evidenceLevel = "medium") {
    const level = mapEvidenceLevel(evidenceLevel);
    return {
      hasUncitedContent: Boolean(raw.hasUncitedContent ?? raw.has_uncited_content ?? level === "low"),
      hasRequirementGap: Boolean(raw.hasRequirementGap ?? raw.has_requirement_gap ?? level !== "high"),
      requiresHumanReview: Boolean(raw.requiresHumanReview ?? raw.requires_human_review ?? level !== "high"),
      readyForReview: Boolean(raw.readyForReview ?? raw.ready_for_review ?? level === "high"),
    };
  }

  function resolveDiagramSource(raw = {}, normalized = {}) {
    const explicit = normalizeDiagramSource(
      raw.diagram || raw.diagram_source || raw.diagramSource || raw.mermaid || raw.mermaidSource || raw.mermaid_source || "",
    );
    return explicit || buildFallbackMermaidDiagram(normalized);
  }

  function normalizeDiagramSource(value) {
    const text = String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/```(?:mermaid)?/gi, "")
      .trim();
    if (!text) {
      return "";
    }
    if (/^(flowchart|graph|mindmap|classDiagram|sequenceDiagram|erDiagram|journey|stateDiagram)/.test(text)) {
      return text;
    }
    return "";
  }

  function buildFallbackMermaidDiagram(result = {}) {
    const lines = ["flowchart TD"];
    const goalLabel = escapeMermaidLabel(result.inputQuestion || result.title || "设计输出");
    lines.push(`GOAL["${goalLabel}"]`);

    const modules = (result.moduleSuggestions || []).slice(0, 4);
    const functions = (result.functionList || []).slice(0, 6);
    const useCases = (result.useCases || []).slice(0, 4);
    const moduleIds = [];
    const functionIds = [];

    modules.forEach((item, index) => {
      const nodeId = `M${index + 1}`;
      moduleIds.push(nodeId);
      lines.push(`${nodeId}["${escapeMermaidLabel(item.name || `模块 ${index + 1}`)}"]`);
      lines.push(`GOAL --> ${nodeId}`);
    });

    functions.forEach((item, index) => {
      const nodeId = `F${index + 1}`;
      functionIds.push(nodeId);
      lines.push(`${nodeId}["${escapeMermaidLabel(item.name || `功能 ${index + 1}`)}"]`);
      const parent = moduleIds.length ? moduleIds[index % moduleIds.length] : "GOAL";
      lines.push(`${parent} --> ${nodeId}`);
    });

    useCases.forEach((item, index) => {
      const nodeId = `UC${index + 1}`;
      lines.push(`${nodeId}["${escapeMermaidLabel(item.name || `用例 ${index + 1}`)}"]`);
      const parent = functionIds.length ? functionIds[index % functionIds.length] : (moduleIds[0] || "GOAL");
      lines.push(`${parent} --> ${nodeId}`);
    });

    return lines.join("\n");
  }

  function escapeMermaidLabel(value) {
    return String(value || "")
      .replace(/"/g, "'")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48) || "未命名节点";
  }

  function mapEvidenceLevel(level) {
    const normalized = String(level || "").toLowerCase();
    if (["high", "sufficient", "充分"].includes(normalized)) {
      return "high";
    }
    if (["low", "insufficient", "不足"].includes(normalized)) {
      return "low";
    }
    return "medium";
  }

  function inferEvidenceLevel(citations = []) {
    if (!citations.length) {
      return "low";
    }

    const scores = citations
      .map((citation) => Number(citation.relevanceScore ?? citation.score ?? 0))
      .filter((score) => Number.isFinite(score))
      .sort((a, b) => b - a);
    const positiveScores = scores.filter((score) => score > 0);
    if (!positiveScores.length) {
      return citations.length >= 2 ? "medium" : "low";
    }

    const bestScore = positiveScores[0];
    if (bestScore >= 0.5 && citations.length >= 3) {
      return "high";
    }
    if (bestScore >= 0.25 || citations.length >= 2) {
      return "medium";
    }
    return "low";
  }

  function toArray(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === undefined || value === "") {
      return [];
    }
    return [value];
  }

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function nowText() {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date())
      .replace(/\//g, "-");
  }

  async function getDocumentsWithBackend() {
    try {
      const response = await getBackend().requestJson("/documents");
      return Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      return [];
    }
  }

  window.designService = {
    getDesignOptions,
    getDesignOutputs,
    generateDesignOutput,
    mapWorkflowDesignOutputToDesignOutput,
    mapCitationToEvidence,
    mapEvidenceLevel,
  };

  window.designApi = window.designService;
})();
