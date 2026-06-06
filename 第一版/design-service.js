/**
 * Design service and adapter layer.
 *
 * The design assistant page calls window.designService only.
 * This layer reads backend-grounded design outputs and keeps the
 * frontend-facing field structure stable for editing/review/export.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getBackend() {
    return window.SuperRagBackend;
  }

  async function getDesignOptions() {
    const documents = await getDocumentsFromBackend();
    const backendProjects = uniqueValues(documents.map((item) => item.project).filter(Boolean));
    return {
      outputTypes: ["功能清单", "详细文本用例", "模块划分建议", "接口设计建议", "风险分析", "答辩说明稿"],
      projects: backendProjects,
      granularities: ["简要", "标准", "详细"],
    };
  }

  async function getDesignOutputs() {
    const records = getBackend()?.getHistoryRecords?.() || [];
    const outputs = records
      .filter((record) => normalizeScene(record.sceneMode || record.scene) === "design")
      .map((record) => record.structuredOutput || record.structured_output || record)
      .filter(Boolean);
    return clone(outputs.map(mapWorkflowDesignOutputToDesignOutput));
  }

  async function generateDesignOutput(payload = {}) {
    try {
      const raw = await getBackend().requestJson("/scenes/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: window.SuperRagConfig?.CHAT_API_TIMEOUT_MS || 90000,
        body: JSON.stringify({
          query: payload.inputQuestion || payload.question,
          project: payload.project,
          module: payload.outputType,
          focus: payload.granularity,
          user: "course-demo-user",
        }),
      });
      const result = mapSceneResultToDesignOutput(raw, payload);
      getBackend().appendHistoryRecord({
        id: result.id,
        title: result.title,
        sceneMode: "design",
        artifactType: "design_output",
        project: result.project,
        summary: result.inputQuestion,
        query: result.inputQuestion,
        originalQuestion: result.inputQuestion,
        outputSummary: result.functionList.map((item) => item.description).join("\n"),
        structuredOutput: result,
        qualityAssessment: result.qualityAssessment || {},
        citations: result.citations,
      });
      return clone(result);
    } catch (error) {
      throw new Error(`设计结果生成失败：${error.message || error}`);
    }
  }

  function mapWorkflowDesignOutputToDesignOutput(raw = {}) {
    const citationItems = normalizeCitationList(raw.citationItems || raw.citationsDetail || raw.citations || []);
    const functionList = (raw.functionList || raw.function_list || raw.functions || []).map(mapFunctionItem);
    const useCases = (raw.useCases || raw.use_cases || raw.textUseCases || raw.text_use_cases || []).map(mapUseCaseItem);
    const moduleSuggestions = (raw.moduleSuggestions || raw.module_suggestions || raw.modules || []).map(mapModuleItem);
    const risks = (raw.risks || raw.riskItems || raw.risk_items || []).map(mapRiskItem);
    const nextActions = (raw.nextActions || raw.next_actions || raw.actions || []).map(mapNextActionItem);
    const evidenceLevel = mapEvidenceLevel(raw.evidenceLevel || raw.evidence_level || inferEvidenceLevel(citationItems));

    const result = {
      id: raw.id || `design-${Date.now()}`,
      title: raw.title || "设计辅助初稿",
      inputQuestion: raw.inputQuestion || raw.input_question || raw.query || "",
      project: raw.project || raw.projectName || raw.project_name || "",
      outputType: raw.outputType || raw.output_type || "详细文本用例",
      outputTypeLabel: raw.outputTypeLabel || raw.output_type_label || raw.outputType || raw.output_type || "详细文本用例",
      granularity: raw.granularity || "标准",
      createdAt: raw.createdAt || raw.created_at || nowText(),
      evidenceLevel,
      functionList,
      useCases,
      moduleSuggestions,
      businessObjects: asList(raw.businessObjects || raw.business_objects).map(mapBusinessObject),
      businessRules: asList(raw.businessRules || raw.business_rules).map(mapBusinessRule),
      dataObjects: asList(raw.dataObjects || raw.data_objects).map(mapDataObject),
      permissionAnalysis: asList(raw.permissionAnalysis || raw.permission_analysis),
      exceptionScenarios: asList(raw.exceptionScenarios || raw.exception_scenarios),
      risks,
      openQuestions: asList(raw.openQuestions || raw.open_questions),
      traceabilityMatrix: asList(raw.traceabilityMatrix || raw.traceability_matrix).map(mapTraceabilityItem),
      evidenceCoverage: mapEvidenceCoverage(raw.evidenceCoverage || raw.evidence_coverage || {}),
      nextActions,
      citations: citationItems.map(mapCitationToEvidence),
      qualityAssessment: raw.qualityAssessment || raw.quality_assessment || {},
      generationMode: raw.generationMode || raw.generation_mode || inferGenerationMode(raw.source),
      pipelineVersion: raw.pipelineVersion || raw.pipeline_version || "",
      structuredSource: raw.structuredSource || raw.structured_source || raw.source || "",
      fallbackNotice: raw.fallbackNotice || raw.fallback_notice || "",
      technicalWarnings: asList(raw.technicalWarnings || raw.technical_warnings),
      qualityChecks: mapQualityChecks(
        raw.qualityChecks || raw.quality_checks || {},
        evidenceLevel,
        raw.qualityAssessment || raw.quality_assessment || {},
      ),
      manualEdited: Boolean(raw.manualEdited || raw.manual_edited),
      modifiedAt: raw.modifiedAt || raw.modified_at || "",
      reviewStatus: raw.reviewStatus || raw.review_status || "",
      humanNotes: raw.humanNotes || raw.human_notes || "",
    };

    if (raw.warning) {
      result.warning = raw.warning;
    }
    if (raw.source) {
      result.source = raw.source;
    }

    result.diagram = resolveDiagramSource(raw, result);
    return result;
  }

  function mapSceneResultToDesignOutput(raw = {}, payload = {}) {
    const citations = normalizeCitationList(raw.citations || []);
    const evidenceLevel = mapEvidenceLevel(raw.evidenceLevel || raw.evidence_level || inferEvidenceLevel(citations));
    const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts : [];
    const artifactItems = artifacts.flatMap((artifact) => artifact.items || [artifact.content].filter(Boolean));
    const evidence = asList(raw.evidence || []);
    const actions = asList(raw.nextActions || []);
    const risks = asList(raw.risks || []);

    const functionList = (raw.functionList || raw.function_list || []).map(mapFunctionItem);
    const useCases = (raw.useCases || raw.use_cases || []).map(mapUseCaseItem);
    const moduleSuggestions = (raw.moduleSuggestions || raw.module_suggestions || []).map(mapModuleItem);

    return mapWorkflowDesignOutputToDesignOutput({
      id: raw.id || `design-${Date.now()}`,
      title: raw.title || "设计辅助输出",
      inputQuestion: payload.inputQuestion || payload.question || "",
      project: raw.collection?.name || payload.project || "",
      outputType: payload.outputType || "设计输出",
      outputTypeLabel: payload.outputType || "设计输出",
      granularity: payload.granularity || "标准",
      createdAt: nowText(),
      evidenceLevel,
      functionList: functionList.length ? functionList : artifactItems.slice(0, 8).map((item, index) => ({
        id: `F-${String(index + 1).padStart(3, "0")}`,
        name: truncateText(String(item), 28) || `功能 ${index + 1}`,
        description: String(item),
        priority: index < 2 ? "high" : "medium",
        relatedDocument: citations[index]?.documentTitle || raw.source || "Dify Lite",
      })),
      useCases: useCases.length ? useCases : evidence.slice(0, 4).map((item, index) => ({
        id: `UC-${String(index + 1).padStart(3, "0")}`,
        name: `用例 ${index + 1}`,
        actor: "业务用户",
        preconditions: [item],
        mainSuccessScenario: [raw.summary || item],
        extensionScenarios: actions.slice(0, 2),
        exceptionScenarios: risks.slice(0, 2),
        postconditions: "输出可进入人工评审。",
      })),
      moduleSuggestions: moduleSuggestions.length ? moduleSuggestions : artifacts.slice(0, 4).map((artifact, index) => ({
        name: artifact.title || `模块 ${index + 1}`,
        responsibility: (artifact.items || [artifact.content]).filter(Boolean).join("；"),
        input: [payload.inputQuestion || payload.question || ""],
        output: artifact.items || [artifact.content].filter(Boolean),
        dependencies: citations.slice(0, 3).map((citation) => citation.documentTitle),
      })),
      businessObjects: raw.businessObjects || raw.business_objects || [],
      businessRules: raw.businessRules || raw.business_rules || [],
      dataObjects: raw.dataObjects || raw.data_objects || [],
      permissionAnalysis: raw.permissionAnalysis || raw.permission_analysis || [],
      exceptionScenarios: raw.exceptionScenarios || raw.exception_scenarios || [],
      risks,
      openQuestions: raw.openQuestions || raw.open_questions || [],
      traceabilityMatrix: raw.traceabilityMatrix || raw.traceability_matrix || [],
      evidenceCoverage: raw.evidenceCoverage || raw.evidence_coverage || {},
      nextActions: actions,
      citations,
      qualityAssessment: raw.qualityAssessment || raw.quality_assessment || {},
      generationMode: raw.generationMode || raw.generation_mode || inferGenerationMode(raw.source),
      pipelineVersion: raw.pipelineVersion || raw.pipeline_version || "",
      structuredSource: raw.structuredSource || raw.structured_source || raw.source || "",
      fallbackNotice: raw.fallbackNotice || raw.fallback_notice || "",
      technicalWarnings: raw.technicalWarnings || raw.technical_warnings || [],
      qualityChecks: raw.qualityChecks || raw.quality_checks || {},
      warning: raw.warning || "",
      source: raw.source || "",
    });
  }

  function mapFunctionItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        id: `F-${String(index + 1).padStart(3, "0")}`,
        name: raw,
        description: "由字符串功能项转换，建议后端持续返回结构化描述。",
        priority: index < 2 ? "high" : "medium",
        relatedDocument: "",
      };
    }
    return {
      id: raw.id || raw.functionId || raw.function_id || `F-${String(index + 1).padStart(3, "0")}`,
      name: raw.name || raw.functionName || raw.function_name || "未命名功能",
      description: raw.description || raw.desc || raw.detail || "待补充功能描述。",
      priority: raw.priority || "medium",
      relatedDocument: raw.relatedDocument || raw.related_document || raw.documentTitle || raw.document_title || "",
      sourceDocument: raw.sourceDocument || raw.source_document || raw.relatedDocument || raw.related_document || "",
      evidenceSnippet: raw.evidenceSnippet || raw.evidence_snippet || raw.snippet || "",
      evidenceScore: Number(raw.evidenceScore ?? raw.evidence_score ?? raw.score ?? 0),
    };
  }

  function mapUseCaseItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        id: `UC-${String(index + 1).padStart(3, "0")}`,
        name: raw,
        actor: "项目成员",
        preconditions: [],
        mainSuccessScenario: [raw],
        extensionScenarios: [],
        exceptionScenarios: [],
        postconditions: "待补充",
      };
    }
    return {
      id: raw.id || raw.useCaseId || raw.use_case_id || `UC-${String(index + 1).padStart(3, "0")}`,
      name: raw.name || raw.useCaseName || raw.use_case_name || "未命名用例",
      goal: raw.goal || raw.objective || raw.brief || "",
      trigger: raw.trigger || raw.triggerCondition || raw.trigger_condition || "",
      actor: raw.actor || raw.participant || "项目成员",
      scope: raw.scope || raw.module || raw.moduleName || raw.module_name || "",
      level: raw.level || "user-goal",
      preconditions: asList(raw.preconditions || raw.precondition),
      mainSuccessScenario: asList(raw.mainSuccessScenario || raw.main_success_scenario || raw.mainFlow || raw.main_flow),
      extensionScenarios: asList(raw.extensionScenarios || raw.extension_scenarios || raw.extensions),
      exceptionScenarios: asList(raw.exceptionScenarios || raw.exception_scenarios || raw.exceptions),
      businessRules: asList(raw.businessRules || raw.business_rules),
      dataFields: asList(raw.dataFields || raw.data_fields || raw.fields),
      acceptanceCriteria: asList(raw.acceptanceCriteria || raw.acceptance_criteria),
      postconditions: raw.postconditions || raw.postcondition || "待补充",
      sourceDocument: raw.sourceDocument || raw.source_document || raw.relatedDocument || raw.related_document || "",
      evidenceSnippet: raw.evidenceSnippet || raw.evidence_snippet || raw.snippet || "",
      evidenceScore: Number(raw.evidenceScore ?? raw.evidence_score ?? raw.score ?? 0),
    };
  }

  function mapModuleItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        name: raw,
        responsibility: "由字符串模块项转换，建议后端持续返回模块职责、输入输出和依赖关系。",
        input: [],
        output: [],
        dependencies: [],
      };
    }
    return {
      name: raw.name || raw.moduleName || raw.module_name || `模块 ${index + 1}`,
      responsibility: raw.responsibility || raw.description || "待补充模块职责。",
      input: asList(raw.input || raw.inputs),
      output: asList(raw.output || raw.outputs),
      dependencies: asList(raw.dependencies || raw.dependency),
      sourceDocument: raw.sourceDocument || raw.source_document || "",
    };
  }

  function mapBusinessObject(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        name: raw,
        meaning: "从证据中识别出的业务对象，待结合原文复核。",
        relatedModules: [],
        sourceDocument: "",
        evidenceSnippet: "",
      };
    }
    return {
      name: raw.name || raw.objectName || raw.object_name || `业务对象 ${index + 1}`,
      meaning: raw.meaning || raw.description || raw.businessMeaning || raw.business_meaning || "待补充业务含义。",
      relatedModules: asList(raw.relatedModules || raw.related_modules || raw.modules),
      sourceDocument: raw.sourceDocument || raw.source_document || raw.evidenceSource || raw.evidence_source || "",
      evidenceSnippet: raw.evidenceSnippet || raw.evidence_snippet || raw.snippet || "",
    };
  }

  function mapBusinessRule(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        rule: raw,
        description: raw,
        impactScope: "待确认影响范围",
        sourceDocument: "",
        evidenceSnippet: "",
        needsReview: true,
      };
    }
    return {
      rule: raw.rule || raw.name || raw.description || `业务规则 ${index + 1}`,
      description: raw.description || raw.rule || "待补充规则描述。",
      impactScope: raw.impactScope || raw.impact_scope || raw.impact || raw.scope || "待确认影响范围",
      sourceDocument: raw.sourceDocument || raw.source_document || raw.evidenceSource || raw.evidence_source || "",
      evidenceSnippet: raw.evidenceSnippet || raw.evidence_snippet || raw.snippet || "",
      needsReview: Boolean(raw.needsReview ?? raw.needs_review ?? true),
    };
  }

  function mapDataObject(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        name: raw,
        fields: [],
        relatedModules: [],
        sourceDocument: "",
      };
    }
    return {
      name: raw.name || raw.objectName || raw.object_name || `数据对象 ${index + 1}`,
      fields: asList(raw.fields || raw.dataFields || raw.data_fields),
      relatedModules: asList(raw.relatedModules || raw.related_modules || raw.modules),
      sourceDocument: raw.sourceDocument || raw.source_document || "",
    };
  }

  function mapTraceabilityItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        requirementSource: raw,
        functionName: "",
        useCaseName: "",
        moduleName: "",
        evidenceSnippet: "",
        sourceDocument: raw,
        evidenceLevel: "partial",
      };
    }
    return {
      requirementSource: raw.requirementSource || raw.requirement_source || raw.source || raw.sourceDocument || `需求来源 ${index + 1}`,
      functionName: raw.functionName || raw.function_name || raw.function || "",
      useCaseName: raw.useCaseName || raw.use_case_name || raw.useCase || raw.use_case || "",
      moduleName: raw.moduleName || raw.module_name || raw.module || "",
      evidenceSnippet: raw.evidenceSnippet || raw.evidence_snippet || raw.snippet || "",
      sourceDocument: raw.sourceDocument || raw.source_document || raw.requirementSource || raw.requirement_source || "",
      evidenceLevel: raw.evidenceLevel || raw.evidence_level || "partial",
    };
  }

  function mapEvidenceCoverage(raw = {}) {
    const coverage = raw && typeof raw === "object" ? raw : {};
    return {
      coveredAspects: asList(coverage.coveredAspects || coverage.covered_aspects),
      missingAspects: asList(coverage.missingAspects || coverage.missing_aspects),
      coverageLevel: coverage.coverageLevel || coverage.coverage_level || "partial",
      reviewSuggestion: coverage.reviewSuggestion || coverage.review_suggestion || "请结合引用证据人工复核后再进入评审。",
    };
  }

  function mapRiskItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        description: raw,
        impact: "影响设计结论的可信度和评审通过率。",
        supplement: "补充需求文档或接口说明。",
        confidence: index === 0 ? "medium" : "low",
        needsReview: true,
      };
    }
    return {
      description: raw.description || raw.riskDescription || raw.risk_description || "待确认风险",
      impact: raw.impact || raw.scope || "待确认影响范围",
      supplement: raw.supplement || raw.suggestedMaterial || raw.suggested_material || raw.suggestion || "补充相关文档。",
      confidence: raw.confidence || "medium",
      needsReview: Boolean(raw.needsReview ?? raw.needs_review ?? true),
      sourceDocument: raw.sourceDocument || raw.source_document || raw.evidenceSource || raw.evidence_source || "",
      evidenceSnippet: raw.evidenceSnippet || raw.evidence_snippet || raw.snippet || "",
    };
  }

  function mapNextActionItem(raw = {}, index = 0) {
    if (typeof raw === "string") {
      return {
        action: raw,
        priority: index === 0 ? "high" : "medium",
        owner: "产品/研发",
        dependentDocument: "",
        doneDefinition: "完成后进入人工评审。",
      };
    }
    return {
      action: raw.action || raw.title || "待办动作",
      priority: raw.priority || "medium",
      owner: raw.owner || raw.suggestedOwner || raw.suggested_owner || "项目成员",
      dependentDocument: raw.dependentDocument || raw.dependent_document || raw.documentTitle || raw.document_title || "",
      doneDefinition: raw.doneDefinition || raw.done_definition || raw.acceptanceCriteria || raw.acceptance_criteria || "完成标准待补充",
    };
  }

  function mapQualityChecks(raw = {}, evidenceLevel, qualityAssessment = {}) {
    const mappedEvidenceLevel = mapEvidenceLevel(evidenceLevel || raw.evidenceLevel || raw.evidence_level);
    return {
      hasUncitedContent: Boolean(raw.hasUncitedContent ?? raw.has_uncited_content ?? mappedEvidenceLevel === "low"),
      hasRequirementGap: Boolean(raw.hasRequirementGap ?? raw.has_requirement_gap ?? mappedEvidenceLevel !== "high"),
      requiresHumanReview: Boolean(raw.requiresHumanReview ?? raw.requires_human_review ?? mappedEvidenceLevel !== "high"),
      readyForReview: Boolean(raw.readyForReview ?? raw.ready_for_review ?? qualityAssessment.canEnterReview ?? mappedEvidenceLevel === "high"),
      score: Number(qualityAssessment.score ?? raw.score ?? 0),
      level: qualityAssessment.level || "",
      evidenceBoundItems: Number(qualityAssessment.evidenceBoundItems ?? qualityAssessment.evidence_bound_items ?? 0),
      totalCheckedItems: Number(qualityAssessment.totalCheckedItems ?? qualityAssessment.total_checked_items ?? 0),
      openIssueCount: Number(qualityAssessment.openIssueCount ?? qualityAssessment.open_issue_count ?? 0),
    };
  }

  function inferGenerationMode(source) {
    const value = String(source || "").toLowerCase();
    if (value.includes("retrieval")) {
      return "retrieval-fallback";
    }
    if (value.includes("json")) {
      return "json-repaired-model";
    }
    if (value) {
      return "model";
    }
    return "unknown";
  }

  function normalizeCitationList(items = []) {
    return (Array.isArray(items) ? items : []).filter((item) => item && typeof item === "object");
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

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function asList(value) {
    if (Array.isArray(value)) {
      return value.filter((item) => item !== null && item !== undefined && String(item).trim());
    }
    if (value === null || value === undefined || String(value).trim() === "") {
      return [];
    }
    return [value];
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

  function truncateText(value, limit = 80) {
    const text = String(value || "");
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  }

  function resolveDiagramSource(raw = {}, mapped = {}) {
    const explicit = normalizeDiagramSource(
      raw.diagram || raw.diagram_source || raw.diagramSource || raw.mermaid || raw.mermaidSource || raw.mermaid_source || "",
    );
    return explicit || buildFallbackMermaidDiagram(mapped);
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

  async function getDocumentsFromBackend() {
    try {
      const response = await getBackend().requestJson("/documents");
      return Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      console.warn(`[SuperRAG DesignService] live documents unavailable: ${error.message || error}`);
      return [];
    }
  }

  function normalizeScene(scene) {
    const value = String(scene || "");
    return value === "general" ? "chat" : value;
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
